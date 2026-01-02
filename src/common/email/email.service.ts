// src/common/email/email.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

// Configuration constants
const CONFIG = {
  JWT_SECRET: 'JWT_SECRET',
  JWT_REFRESH_SECRET: 'your_jwt_refresh_secret',
  RESEND_API_KEY: 're_FhzGY32J_CayRNBgiZbhnDQrNMG5GydJs',
  EMAIL_FROM: 'Lead CRM <info@digiwebspot.com>',
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;

  constructor() {
    // Initialize Resend email service
    this.resend = new Resend(CONFIG.RESEND_API_KEY);
  }

  async sendReminderEmail(
    to: string,
    recipientName: string,
    conversationData: {
      leadName: string;
      phone: string;
      email?: string;
      scheduledAt: Date;
      conversationId: number;
      tenantKey: string;
    },
  ): Promise<boolean> {
    try {
      const formattedDate = new Date(conversationData.scheduledAt).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });

      const frontendUrl = process.env.FRONTEND_URL || 'https://leadcrm.digiwebspot.com';
      const conversationUrl = `${frontendUrl}/messanger?conversation=${conversationData.conversationId}`;

      const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Follow-up Reminder - Lead CRM</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body, html {
      width: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      padding: 40px 20px;
    }
    
    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
    }
    
    .email-container {
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    
    .email-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 30px;
      text-align: center;
    }
    
    .email-header h1 {
      color: #ffffff;
      font-size: 28px;
      font-weight: 700;
      margin: 0;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    
    .email-body {
      padding: 50px 40px;
    }
    
    .greeting {
      font-size: 20px;
      color: #2d3748;
      margin-bottom: 20px;
      font-weight: 600;
    }
    
    .message {
      font-size: 16px;
      color: #4a5568;
      line-height: 1.6;
      margin-bottom: 25px;
    }
    
    .reminder-box {
      background: #fff5f5;
      border-left: 4px solid #fc8181;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
    }
    
    .reminder-box h2 {
      color: #742a2a;
      font-size: 18px;
      margin-bottom: 10px;
    }
    
    .lead-details {
      background: #f7fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin: 25px 0;
    }
    
    .lead-details h3 {
      color: #2d3748;
      font-size: 16px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .detail-row:last-child {
      border-bottom: none;
    }
    
    .detail-label {
      font-weight: 600;
      color: #4a5568;
    }
    
    .detail-value {
      color: #2d3748;
    }
    
    .button-container {
      text-align: center;
      margin: 40px 0;
    }
    
    .action-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 18px 50px;
      border-radius: 50px;
      font-size: 16px;
      font-weight: 600;
      letter-spacing: 0.5px;
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
      transition: all 0.3s ease;
    }
    
    .action-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 40px rgba(102, 126, 234, 0.5);
    }
    
    .email-footer {
      background: #f7fafc;
      padding: 30px 40px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    
    .footer-text {
      font-size: 13px;
      color: #a0aec0;
      line-height: 1.6;
      margin: 5px 0;
    }
    
    @media only screen and (max-width: 600px) {
      body, html {
        padding: 20px 10px;
      }
      
      .email-body {
        padding: 35px 25px;
      }
      
      .email-header {
        padding: 30px 20px;
      }
      
      .email-header h1 {
        font-size: 24px;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <div class="email-header">
        <h1>⏰ Follow-up Reminder</h1>
      </div>
      
      <div class="email-body">
        <p class="greeting">Hello ${recipientName}! 👋</p>
        
        <p class="message">
          This is a reminder that you have a scheduled follow-up for a lead conversation.
        </p>
        
        <div class="reminder-box">
          <h2>📅 Scheduled Time</h2>
          <p style="font-size: 18px; color: #742a2a; font-weight: 600; margin-top: 10px;">
            ${formattedDate}
          </p>
        </div>
        
        <div class="lead-details">
          <h3>Lead Information</h3>
          <div class="detail-row">
            <span class="detail-label">Lead Name:</span>
            <span class="detail-value">${conversationData.leadName || 'N/A'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Phone Number:</span>
            <span class="detail-value">${conversationData.phone || 'N/A'}</span>
          </div>
          ${conversationData.email ? `
          <div class="detail-row">
            <span class="detail-label">Email:</span>
            <span class="detail-value">${conversationData.email}</span>
          </div>
          ` : ''}
          <div class="detail-row">
            <span class="detail-label">Conversation ID:</span>
            <span class="detail-value">#${conversationData.conversationId}</span>
          </div>
        </div>
        
        <div class="button-container">
          <a href="${conversationUrl}" class="action-button">
            Open Conversation
          </a>
        </div>
        
        <p class="message" style="margin-top: 30px; font-size: 14px; color: #718096;">
          Please follow up with this lead at the scheduled time. Click the button above to view the conversation and continue the discussion.
        </p>
      </div>
      
      <div class="email-footer">
        <p class="footer-text">This is an automated reminder from Lead CRM.</p>
        <p class="footer-text">© ${new Date().getFullYear()} Lead CRM. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `;

      const { data, error } = await this.resend.emails.send({
        from: CONFIG.EMAIL_FROM,
        to,
        subject: `⏰ Follow-up Reminder: ${conversationData.leadName} - ${formattedDate}`,
        html: emailHtml,
      });

      if (error) {
        this.logger.error(`❌ Failed to send reminder email to ${to}:`, error);
        return false;
      }

      this.logger.log(`✅ Reminder email sent to ${to}: ${data?.id}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send reminder email to ${to}:`, error);
      return false;
    }
  }
}

