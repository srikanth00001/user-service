import { PartialType } from '@nestjs/mapped-types';
import { CreateGoogleAdDto } from './create-google-ad.dto';

export class UpdateGoogleAdDto extends PartialType(CreateGoogleAdDto) {}
