import { Injectable, Logger } from '@nestjs/common';
import { DatabaseManager } from '../../common/database/database.manager';
import { GoogleFormLead } from './entities/google-form.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import * as crypto from 'crypto';

@Injectable()
export class GoogleFormService {
  private readonly logger = new Logger(GoogleFormService.name);

  constructor(private readonly dbManager: DatabaseManager) { }

  async handleWebhook(payload: any, userId: string, email: string, campaignName: string) {
    this.logger.log('---------------- GOOGLE FORM WEBHOOK START ----------------');
    this.logger.log(`RAW PAYLOAD → ${JSON.stringify(payload)}`);

    // =====================================================
    // STEP 1 - SAFE PARSE PABBLY PAYLOAD
    // =====================================================
    let row: any = null;

    try {
      const key = Object.keys(payload)[0];
      this.logger.log(`Pabbly Key Received → ${key}`);
      row = JSON.parse(key);
    } catch {
      this.logger.warn('Primary parse failed → using raw payload');
      row = payload;
    }

    this.logger.log(`Parsed Row → ${JSON.stringify(row)}`);

    // =====================================================
    // STEP 2 - EMAIL DETECTION
    // =====================================================
    let emailValue =
      row.Email ||
      row.email ||
      row["Email Address"] ||
      row["Your Email"] ||
      row["E-mail"] ||
      row["email_address"] ||
      row["Email ID"] ||
      row["Mail"] ||
      null;

    if (!emailValue) {
      this.logger.warn('Normal email fields not found → scanning values');

      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'string' && value.includes('@')) {
          emailValue = value;
          this.logger.log(`Email auto-detected from column "${key}" → ${value}`);
          break;
        }
      }
    }

    // =====================================================
    // STEP 3 - NAME DETECTION (SAFE & ACCURATE)
    // =====================================================
    let nameValue =
      row.Name ||
      row.name ||
      row["Full Name"] ||
      row["Your Name"] ||
      null;

    // Priority → Google Forms Column 2
    if (!nameValue && row["Column 2"]) {
      nameValue = row["Column 2"];
      this.logger.log(`Name detected from Column 2 → ${nameValue}`);
    }

    // Smart auto-detection if still missing
    if (!nameValue) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value !== "string") continue;

        // Skip timestamps
        if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(value) || value.includes(":")) continue;

        // Skip phone numbers
        if (/^[0-9]{8,12}$/.test(value)) continue;

        // Skip spreadsheet data
        if (key.startsWith("Sheet") || key.startsWith("Spreadsheet")) continue;

        // Accept only values with alphabets → real names
        if (/[a-zA-Z]/.test(value)) {
          nameValue = value;
          this.logger.log(`Name auto-detected → ${value}`);
          break;
        }
      }
    }

    // =====================================================
    // STEP 4 - PHONE DETECTION
    // =====================================================
    let phoneValue =
      row.Phone ||
      row.phone ||
      row.Mobile ||
      row["Phone Number"] ||
      row["Contact Number"] ||
      null;

    if (!phoneValue) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'string' && /^[0-9]{9,12}$/.test(value)) {
          phoneValue = value;
          this.logger.log(`Phone auto-detected from "${key}" → ${value}`);
          break;
        }
      }
    }

    this.logger.log(`Final Email → ${emailValue}`);
    this.logger.log(`Final Name → ${nameValue}`);
    this.logger.log(`Final Phone → ${phoneValue}`);

    if (!emailValue) {
      this.logger.error('❌ Email missing → cannot save lead');
      throw new Error('Email is required');
    }

    // =====================================================
    // STEP 5 - FETCH TENANT DB
    // =====================================================
    const { dataSource } = await this.dbManager.getConnectionForUser({
      id: userId,
      email,
    });

    const leadRepo = dataSource.getRepository(GoogleFormLead);
    const campaignRepo = dataSource.getRepository(Campaign);

    this.logger.log('Tenant DB Connected Successfully');

    // =====================================================
    // STEP 6 - FIND OR CREATE CAMPAIGN
    // =====================================================
    this.logger.log(`Looking for Campaign → ${campaignName}`);

    let campaign = await campaignRepo.findOne({
      where: { name: campaignName, createdBy: userId },
    });

    if (!campaign) {
      this.logger.warn(`Campaign not found → creating "${campaignName}"`);

      campaign = await campaignRepo.save(
        campaignRepo.create({
          name: campaignName,
          createdBy: userId,
          active: true,
          secretKey: crypto.randomUUID(),
        })
      );

      this.logger.log(`Campaign Created → ID: ${campaign.id}`);
    }

    // =====================================================
    // STEP 7 - SAVE LEAD
    // =====================================================
    const lead = leadRepo.create({
      responseId: crypto.randomUUID(),
      name: nameValue,
      email: emailValue,
      phone: phoneValue,
      answers: row,
      formId: row.FormId || campaignName,
      createdBy: userId,
      campaign,
    });

    const saved = await leadRepo.save(lead);

    this.logger.log(`Lead Saved → ID: ${saved.id}`);
    this.logger.log('---------------- GOOGLE FORM WEBHOOK END ----------------');

    return {
      status: 'success',
      id: saved.id,
      responseId: saved.responseId,
    };
  }
}
