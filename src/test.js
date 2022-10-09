/**
 * script that starts the sequencer and tests the happy path of inserting a public key,
 * fetching the merkle witness for it and calling the world id zkapp to produce a proof of unique personhood
 */
import { Field, isReady, Mina, PrivateKey, verify } from 'snarkyjs';
import { isRunning, PORT } from './sequencer.js';
import { WorldId } from '../build/src/WorldId.js';
import { StringOf7Fields } from '../build/src/HumanMessage.js';

await isRunning;
await isReady;

let sequencerUrl = `http://localhost:${PORT}`;

let msg = StringOf7Fields.from('blabla');
console.log(StringOf7Fields.ofFields(msg.toFields()).toString());

let { privateKey, publicKey } = WorldId.generateKeypair();
let irisHash = Field.random();

await WorldId.postPublicKey(sequencerUrl, publicKey, irisHash);

// now fetch the merkle proof
let worldId = new WorldId(PrivateKey.random().toPublicKey());
let { witness, signedRoot } = await WorldId.fetchMerkleProof(
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
let [proof] = await tx.prove();

let ok = await verify(proof, WorldId._verificationKey.data);
if (!ok) throw Error('verification failure!');
console.log('success!');
process.exit(0);
