import { createBriefRoomServer } from '../../server/app.ts';

// The static frontend is served from the publish directory; this server only
// handles the API routes and the WebSocket relay.
const { server } = createBriefRoomServer();

export default server;

export const config = {
  path: ['/api/*', '/ws'],
};
