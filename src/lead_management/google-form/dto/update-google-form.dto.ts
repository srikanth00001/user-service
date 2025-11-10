import { PartialType } from '@nestjs/mapped-types';
import { CreateGoogleFormDto } from './create-google-form.dto';

export class UpdateGoogleFormDto extends PartialType(CreateGoogleFormDto) {}
