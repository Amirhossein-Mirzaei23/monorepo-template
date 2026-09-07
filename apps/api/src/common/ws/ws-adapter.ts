import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';
import { requireAppConfig } from '../../config/configuration';

/** The optional bag IoAdapter.create accepts alongside ServerOptions. */
type CreateOptions = Parameters<IoAdapter['create']>[1];

/**
 * CHT-004 — the socket.io adapter used for the /ws gateway. Extends the
 * default IoAdapter solely to merge the HANDSHAKE CORS policy from config
 * (`app.ws.origins`, PLAT-003's WS_ORIGINS) with credentials enabled — the
 * engine.io polling transport negotiates over HTTP before the websocket
 * upgrade, so the browser blocks the handshake without an ACAO header.
 *
 * Why an adapter instead of options on @WebSocketGateway: decorator options
 * are static objects evaluated at import time, before a ConfigService exists.
 * Registered in main.ts via `app.useWebSocketAdapter(new WsAdapter(app,
 * app.get(ConfigService)))` — mirrors the app's config-driven enableCors and
 * is intentionally SEPARATE from REST corsOrigins (WS_ORIGINS is its own env
 * knob so the two allowlists can diverge).
 */
export class WsAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly config: ConfigService,
  ) {
    super(app);
  }

  override create(port: number, options?: CreateOptions): Server {
    const cors: ServerOptions['cors'] = {
      origin: requireAppConfig(this.config).ws.origins,
      credentials: true,
    };
    // Spreading an `options | undefined` widens required keys (path) to
    // optional — assert the merged shape instead of hand-listing defaults.
    const merged = { ...options, cors } as CreateOptions;
    return super.create(port, merged);
  }
}
