import http from "node:http";
import { ethers } from "ethers";
const c = ethers.AbiCoder.defaultAbiCoder();
const KS="0x1111111111111111111111111111111111111111", LB="0x2222222222222222222222222222222222222222", REG="0x8004A818BFB912233c491871b3d84c89A494BD9e".toLowerCase();
const T = s => ethers.id(s), P = v => ethers.zeroPadValue(ethers.toBeHex(v), 32), A = a => ethers.zeroPadValue(a, 32);
let li = 0;
const L = (address, block, topics, data) => ({ address, blockNumber: ethers.toQuantity(block), blockHash: "0x"+block.toString(16).padStart(64,"0"),
  transactionHash: "0x"+(++li).toString(16).padStart(64,"0"), transactionIndex: "0x0", logIndex: ethers.toQuantity(li), removed: false, topics, data });
const U64MAX = 2n**64n-1n;
const strBytes = (a, b) => c.encode(["bytes","bytes"], [a, b]);
const link = (id, ks) => c.encode(["string","bytes"], ["trustset", c.encode(["uint256","address","uint256"], [10143n, ks, id])]);
const MS = T("MetadataSet(uint256,string,string,bytes)");
const logs = [
  L(KS, 1010, [T("AgentRegistered(uint256,address,address,address[],uint8)"), P(1), A("0x00000000000000000000000000000000000000a1"), A("0x00000000000000000000000000000000000000b1")], c.encode(["address[]","uint8"], [[], 0])),
  L(KS, 1020, [T("LimitsSet(uint256,uint64,uint64)"), P(1)], c.encode(["uint64","uint64"], [U64MAX, U64MAX])),          // poison 2
  L(LB, 1030, [T("Labelled(uint256,address,string,string)"), P(1), A("0x00000000000000000000000000000000000000b1")], strBytes(ethers.toUtf8Bytes("nul\u0000name"), ethers.toUtf8Bytes("ok"))), // poison 3
  L(LB, 1040, [T("Labelled(uint256,address,string,string)"), P(1), A("0x00000000000000000000000000000000000000b1")], strBytes("0xff41c3", ethers.toUtf8Bytes("bad utf8"))), // poison 4
  L(REG, 1050, [MS, P(7), T("trustset")], link(2n**255n, KS)),                                                 // poison 1
  L(REG, 1055, [MS, P(8), T("trustset")], link(1n, "0x9999999999999999999999999999999999999999")),          // other switch: must be ignored
  L(REG, 1060, [MS, P(9), T("trustset")], link(1n, KS)),                                                     // good link
  L(KS, 1070, [T("Beat(uint256,uint64)"), P(1)], c.encode(["uint64"], [1700001070n])),                        // good row after poison
];
const STAKE = "0x0000000000000000000000000000000000001000";
/* agent 1 (registered at 1010, key ...a1) stakes at 1012, the same window */
const stakeLogs = [L(STAKE, 1012, [T("Delegate(uint64,address,uint256,uint64)"), P(91), A("0x00000000000000000000000000000000000000a1")], c.encode(["uint256","uint64"], [5n * 10n**17n, 7n]))];
const block = n => ({ number: ethers.toQuantity(n), hash: "0x"+n.toString(16).padStart(64,"0"), parentHash: "0x"+"00".repeat(32), timestamp: ethers.toQuantity(1_700_000_000+n),
  nonce: "0x0000000000000000", difficulty: "0x0", gasLimit: "0x1", gasUsed: "0x0", miner: "0x"+"00".repeat(20), extraData: "0x", baseFeePerGas: "0x0", transactions: [] });
http.createServer((req, res) => { let b=""; req.on("data", x => b+=x); req.on("end", () => {
  const j = JSON.parse(b); const one = q => { let result = null;
    if (q.method==="eth_chainId") result="0x279f";
    else if (q.method==="eth_blockNumber") result=ethers.toQuantity(1200);
    else if (q.method==="eth_getBlockByNumber") result=block(q.params[0]==="finalized"?1200:Number(q.params[0]));
    else if (q.method==="eth_getLogs") { const f=q.params[0], lo=Number(f.fromBlock), hi=Number(f.toBlock), ad=String(f.address).toLowerCase();
      result = ad==="0x0000000000000000000000000000000000001000" ? stakeLogs.filter(l => Number(l.blockNumber)>=lo && Number(l.blockNumber)<=hi) : logs.filter(l => l.address.toLowerCase()===ad && Number(l.blockNumber)>=lo && Number(l.blockNumber)<=hi); }
    return { jsonrpc:"2.0", id:q.id, result }; };
  res.setHeader("content-type","application/json"); res.end(JSON.stringify(Array.isArray(j)?j.map(one):one(j))); }); }).listen(Number(process.env.PORT), "127.0.0.1");
