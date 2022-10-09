/**
 * script that starts the sequencer and tests the happy path of inserting a public key,
 * fetching the merkle witness for it and calling the world id zkapp to produce a proof of unique personhood
 */
import { Field, isReady, Mina, Poseidon, PrivateKey } from 'snarkyjs';
import { isRunning, PORT } from './sequencer.js';
import { WorldId } from '../build/src/WorldId.js';

await isRunning;
await isReady;

let sequencerUrl = `http://localhost:${PORT}`;

let privateKey = { trapdoor: Field.random(), nullifier: Field.random() };
let publicKey = Poseidon.hash([privateKey.trapdoor, privateKey.nullifier]);
let irisHash = Field.random();

let response = await fetch(`${sequencerUrl}/insert`, {
  method: 'POST',
  body: JSON.stringify({ irisHash, publicKey }),
});
console.log({ status: response.status });

// now fetch the merkle proof
let worldId = new WorldId(PrivateKey.random().toPublicKey());
let { witness, signedRoot } = await worldId.fetchMerkleProof(
  sequencerUrl,
  publicKey
);

// compile the smart contract, create a mina tx and prove it
await WorldId.compile();

let tx = await Mina.transaction(() => {
  worldId.provePersonhood(
    privateKey,
    witness,
    signedRoot,
    Field.zero,
    Field.zero
  );
});
await tx.prove();
console.log(tx.toPretty());
process.exit(0);
