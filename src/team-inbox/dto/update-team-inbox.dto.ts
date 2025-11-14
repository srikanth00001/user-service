import { PartialType } from '@nestjs/swagger';
import { CreateTeamInboxDto } from './create-team-inbox.dto';

export class UpdateTeamInboxDto extends PartialType(CreateTeamInboxDto) {}
