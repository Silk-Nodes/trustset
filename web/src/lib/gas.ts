/* the message a wallet signs to ask /api/gas for testnet gas. shared by the
   route and the browser so the two cannot drift. dated, so a signature is
   good for one day and cannot be replayed later. */
export const gasMessage = (address: string, day: string) => `trustset: testnet gas for ${address.toLowerCase()} on ${day}`;
export const gasDay = () => new Date().toISOString().slice(0, 10);

/* the message a wallet signs to have the demo register a practice agent it
   owns. registering costs the demo key gas and funding, so it has to be the
   owner at the keyboard asking, not an address sprayed at the endpoint. */
export const demoMessage = (address: string, day: string) => `trustset: a practice agent owned by ${address.toLowerCase()} on ${day}`;
