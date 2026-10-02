import http from "node:http";
import { ethers } from "ethers";
const I = new ethers.Interface(["function count() view returns (uint256)",
 "function get(uint256) view returns (tuple(address payer,address service,address token,uint256 amount,uint64 deadline,bytes32 requestHash,uint8 state))",
 "function refund(uint256)", "error TransferFailed()"]);
const now = Math.floor(Date.now()/1000); const st = { 1: 1, 2: 1 }; const sent = []; let nonce = 0;
const pay = id => [ethers.ZeroAddress, "0x00000000000000000000000000000000000000bb", ethers.ZeroAddress, 1n, BigInt(now - 60), ethers.ZeroHash, st[id]];
const revert = { code: 3, message: "execution reverted", data: I.encodeErrorResult("TransferFailed", []) };
const receipts = {};
http.createServer((q, res) => { let b = ""; q.on("data", c => b += c); q.on("end", () => {
  const one = r => { let result = null, error;
    switch (r.method) {
      case "eth_chainId": result = "0x279f"; break;
      case "eth_getBalance": result = "0xde0b6b3a7640000"; break;
      case "eth_blockNumber": result = "0x10"; break;
      case "eth_gasPrice": case "eth_maxPriorityFeePerGas": result = "0x3b9aca00"; break;
      case "eth_getTransactionCount": result = ethers.toQuantity(nonce); break;
      case "eth_getBlockByNumber": result = { number: "0x10", hash: "0x" + "11".repeat(32), parentHash: "0x" + "00".repeat(32), timestamp: ethers.toQuantity(now), baseFeePerGas: "0x3b9aca00", gasLimit: "0x1c9c380", gasUsed: "0x0", miner: "0x" + "00".repeat(20), extraData: "0x", difficulty: "0x0", nonce: "0x0000000000000000", transactions: [] }; break;
      case "eth_estimateGas": case "eth_call": {
        const f = I.parseTransaction({ data: r.params[0].data });
        if (f.name === "count") result = I.encodeFunctionResult("count", [2]);
        else if (f.name === "get") result = I.encodeFunctionResult("get", [pay(Number(f.args[0]))]);
        else if (f.name === "refund") { if (Number(f.args[0]) === 1) error = revert; else result = r.method === "eth_call" ? "0x" : "0x186a0"; }
        break; }
      case "eth_sendRawTransaction": { const tx = ethers.Transaction.from(r.params[0]); const id = Number(I.parseTransaction({ data: tx.data }).args[0]);
        sent.push(id); nonce++; const ok = id !== 1; if (ok) st[id] = 3;
        receipts[tx.hash] = { transactionHash: tx.hash, blockNumber: "0x10", blockHash: "0x" + "11".repeat(32), status: ok ? "0x1" : "0x0", logs: [], gasUsed: "0x1", cumulativeGasUsed: "0x1", effectiveGasPrice: "0x1", from: tx.from, to: tx.to, transactionIndex: "0x0", type: "0x2", logsBloom: "0x" + "00".repeat(256), contractAddress: null };
        result = tx.hash; break; }
      case "eth_getTransactionReceipt": result = receipts[r.params[0]] ?? null; break;
      case "eth_getTransactionByHash": result = null; break;
    }
    return error ? { jsonrpc: "2.0", id: r.id, error } : { jsonrpc: "2.0", id: r.id, result }; };
  const j = JSON.parse(b); res.setHeader("content-type", "application/json"); res.end(JSON.stringify(Array.isArray(j) ? j.map(one) : one(j))); }); })
 .listen(Number(process.env.PORT), "127.0.0.1");
setInterval(() => console.log("SENT", JSON.stringify(sent)), 1000);
