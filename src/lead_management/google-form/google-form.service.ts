import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseManager } from '../../common/database/database.manager';
import { GoogleFormLead } from './entities/google-form.entity';

@Injectable()
export class GoogleFormService {
  constructor(private readonly dbManager: DatabaseManager) {}

  async handleWebhook(payload: any, publisherEmail: string) {

    console.log("🔥 RAW PAYLOAD ===>", payload);

    // CASE 1 - Pabbly sends key as stringified JSON, value empty
    let row: any;

    try {
      const firstKey = Object.keys(payload)[0];  
      row = JSON.parse(firstKey);     // extract actual row
    } catch (e) {
      // fallback: maybe normal JSON
      row = payload;
    }

    console.log("🟢 Parsed Row ===>", row);

    const normalized = {
      email: row.Email || row.email || null,
      name: row.Name || row.name || null,
      phone: row.Phone || row.phone || null,

      externalLeadId: row.responseId || row.RowIndex || `resp_${Date.now()}`,
      allFields: row
    };

    if (!normalized.email) {
      throw new HttpException('Email required', HttpStatus.BAD_REQUEST);
    }

    const { dataSource } = await this.dbManager.getConnectionForUser({
      id: 'google-form-system',
      email: publisherEmail,
    });

    const repo = dataSource.getRepository(GoogleFormLead);

    if (await repo.findOne({ where: { responseId: normalized.externalLeadId } })) {
      return { status: 'success', message: 'already_saved' };
    }

    const lead = repo.create({
      responseId: normalized.externalLeadId,
      name: normalized.name,
      email: normalized.email,
      phone: normalized.phone,
      answers: normalized.allFields,
      formId: row.FormId || 'form',
      createdBy: publisherEmail,
    });

    const saved = await repo.save(lead);
    return { status: 'success', leadId: saved.id };
  }
}
