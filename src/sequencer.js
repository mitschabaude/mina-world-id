import http from 'node:http';
import { Experimental, Field, PrivateKey, Signature } from 'snarkyjs';
import { MERKLE_TREE_HEIGHT } from './constants.js';

// private and public key pair which signs the merkle root
let sequencerPrivateKey = PrivateKey.random();
let sequencerPublicKey = sequencerPrivateKey.toPublicKey();

// list of unique humans & merkle tree which stores public keys in its leafs
const irisHashes = new Set();
const publicKeys = [];
const tree = new Experimental.MerkleTree(MERKLE_TREE_HEIGHT);
let currentIndex = 0;

let server = http.createServer(async (req, res) => {
  let response = '';
  let headers = {};
  try {
    console.log(req.url);
    switch (req.url) {
      // endpoint that inserts a new public key, provided that the iris hash is unique
      // TODO: should check that this is signed by one of the registered orbs
      case '/insert': {
        let body = await getBodyJSON(req);
        let { irisHash, publicKey } = body;

        // reject if the iris hash was already registered
        if (irisHashes.has(irisHash)) {
          res.writeHead(403, headers);
          res.end();
          return;
        }

        // store irisHash, and add public key to tree
        irisHashes.add(irisHash);
        publicKeys[currentIndex] = publicKey;
        tree.setLeaf(BigInt(currentIndex), Field(publicKey));
        currentIndex++;
        break;
      }
      // endpoint that produce a merkle proof for inclusion of a given public key
      case '/proof': {
        let body = await getBodyJSON(req);
        let { publicKey } = body;
        let index = publicKeys.findIndex((pk) => pk === publicKey);
        if (index === -1) {
          res.writeHead(404, headers);
          res.end();
          return;
        }
        let witness = tree.getWitness(BigInt(index));
        let root = tree.getRoot();
        let signature = Signature.create(sequencerPrivateKey, [root]);
        response = JSON.stringify({ witness, root, signature });
        break;
      }
      // endpoint that returns the sequencer's public key
      case '/public-key': {
        response = JSON.stringify({ publicKey: sequencerPublicKey });
      }
    }
    res.writeHead(200, headers);
    res.write(response);
    res.end();
  } catch {
    res.writeHead(500, {});
    res.end();
  }
});

let PORT = 3000;
server.listen(PORT, () => {
  console.log(`server running on http://localhost:${PORT}`);
});

function getBodyJSON(request) {
  return new Promise((resolve, reject) => {
    let body = [];
    request
      .on('data', (chunk) => {
        body.push(chunk);
      })
      .on('end', () => {
        try {
          let json = Buffer.concat(body).toString();
          resolve(JSON.parse(json));
        } catch {
          reject('could not parse request to JSON');
        }
      })
      .on('error', () => {
        reject('could not collect request into strings');
      });
  });
}
