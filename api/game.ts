import { createGameServer } from '../server/index.js';

// Vercel owns the listener. Four-minute rounds leave time for the results
// screen before the Hobby plan's five-minute connection limit.
const game = await createGameServer({ listen: false, roundMs: 240_000 });
export default game.server;
