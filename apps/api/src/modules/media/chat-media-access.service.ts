import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * CHT-007 — the read-only authorization probes behind the secure serving
 * route's participant gate ("authorized if requester participates in a
 * conversation containing that asset"):
 *
 * - {@link isReferencedByMessage}: an asset becomes CHAT-ATTACHED the moment
 *   a Message row references it (card wording). Unreferenced assets keep the
 *   unchanged MEDIA-001 contract (authenticated-only on the secure route).
 * - {@link requesterParticipates}: at least ONE conversation that carries a
 *   message with this asset must take the requester's side (buyer OR seller).
 *
 * PLACEMENT NOTE (deliberate, documented): these two reads live in the MEDIA
 * module and query the conversation/message tables directly. The clean route
 * — MediaModule importing ConversationsModule for its repository — is a
 * dependency CYCLE (Conversations → Lots → Media), and the backend rule this
 * bends ("cross-domain effects go through the other domain's service")
 * targets WRITES; this service is read-only, never opens a transaction and
 * never writes another module's tables. The queries are single indexed probes
 * (Message.mediaAssetId FK, Conversation participant sides).
 */
@Injectable()
export class ChatMediaAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Is this asset referenced by at least one Message (chat-attached)? */
  async isReferencedByMessage(mediaAssetId: string): Promise<boolean> {
    const count = await this.prisma.message.count({ where: { mediaAssetId } });
    return count > 0;
  }

  /**
   * Does the requester take a side of at least one conversation whose
   * messages reference this asset? The `messages.some` arm rides the
   * Message.mediaAssetId FK; the participant union mirrors the inbox scope
   * (buyer OR seller).
   */
  async requesterParticipates(mediaAssetId: string, userId: string): Promise<boolean> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
        messages: { some: { mediaAssetId } },
      },
      select: { id: true },
    });
    return conversation !== null;
  }
}
