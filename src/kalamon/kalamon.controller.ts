import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RagService } from './rag.service';
import { ChatSchema, ChatResult } from './dto/chat.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('kalamon')
@UseGuards(JwtAuthGuard)
@Controller('kalamon')
export class KalamonController {
  constructor(private readonly rag: RagService) {}

  // L'endpoint de chat de l'UI. Derrière : RAG + cache, JAMAIS de chat ouvert.
  @Post('chat')
  chat(@Body() body: unknown, @CurrentUser() user: AuthUser): Promise<ChatResult> {
    const input = ChatSchema.parse(body);
    return this.rag.chat(user.organizationId, input);
  }
}
