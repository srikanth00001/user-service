// src/message/dto/create-message.dto.ts
import { IsOptional, IsString, IsNumber, IsBoolean, IsIn } from 'class-validator';

export class CreateMessageDto {
  @IsNumber()
  conversation_id: number;

  @IsOptional()
  @IsString()
  sender_user_id?: string;

  @IsOptional()
  @IsNumber()
  parent_message_id?: number;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @IsIn(['text', 'image', 'video', 'document', 'audio', 'sticker'])
  type?: 'text' | 'image' | 'video' | 'document' | 'audio' | 'sticker';

  @IsOptional()
  @IsBoolean()
  view_once?: boolean;

  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsString()
  whatsapp_message_id?: string;

  @IsOptional()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsBoolean()
  deleted_for_me?: boolean;

  @IsOptional()
  @IsBoolean()
  deleted_for_everyone?: boolean;

  @IsOptional()
  @IsString()
  media_url?: string;

  @IsOptional()
  @IsString()
  reaction?: string;
}
