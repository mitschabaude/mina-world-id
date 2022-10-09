import {
  AccountUpdate,
  arrayProp,
  CircuitValue,
  Encoding,
  Field,
  isReady,
  method,
  Mina,
  PrivateKey,
  PublicKey,
  SmartContract,
  State,
  state,
} from 'snarkyjs';
import {
  MerkleWitness,
  SemaphorePrivateKey,
  SignedMerkleRoot,
  WorldId,
} from './WorldId.js';

export {
  HumanMessage,
  StringOf7Fields,
  deployHumanMessage,
  zkappAddress,
  getMessage,
  feePayer,
};

class StringOf7Fields extends CircuitValue {
  @arrayProp(Field, 7) fields: Field[];

  static from(message: string) {
    let fields = Encoding.Bijective.Fp.fromString(message);
    let n = fields.length;
    if (n > 7) throw Error('string too long');
    fields = fields.concat(Array(7 - n).fill(Field.zero));
    return new StringOf7Fields(fields);
  }

  toString() {
    return Encoding.Bijective.Fp.toString(this.fields);
  }
}

class HumanMessage extends SmartContract {
  @state(StringOf7Fields) currentMessage = State<StringOf7Fields>();
  @state(Field) currentNullifier = State<Field>();

  events = { message: StringOf7Fields };

  /**
   * publish a message, provided you're a unique human, and you didn't do the last message already
   */
  @method publishMessage(
    message: StringOf7Fields,
    privateKey: SemaphorePrivateKey,
    // TODO: when we support async circuits, we can fetch the merkle proof inside this method
    merklePath: MerkleWitness,
    signedRoot: SignedMerkleRoot
  ) {
    // check that whoever wants to publish is a human
    let externalNullifier = Encoding.stringToFields('human message')[0];
    let worldId = new WorldId(PublicKey.empty());
    let nullifier = worldId.provePersonhoodBase(
      privateKey,
      merklePath,
      signedRoot,
      externalNullifier
    );
    // we use the nullifier to ensure that nobody can publish 2 messages in a row!
    let currentNullifier = this.currentNullifier.get();
    this.currentNullifier.assertEquals(currentNullifier); // precondition which is checked by on chain verifier
    currentNullifier.equals(nullifier).assertFalse();

    this.currentMessage.set(message);
    this.emitEvent('message', message);
  }
}

await isReady;

// local ledger for mocking blockchain interactions
// TODO: deploy to testnet and use deployed version instead
let LocalBlockchain = Mina.LocalBlockchain();
Mina.setActiveInstance(LocalBlockchain);

let feePayer = LocalBlockchain.testAccounts[0].privateKey;
let zkappKey = PrivateKey.random();
let zkappAddress = zkappKey.toPublicKey();

let isDeployed = false;

// helper to "deploy" the contract to the local ledger, if it isn't yet
async function deployHumanMessage() {
  if (isDeployed) return;
  await HumanMessage.compile();

  let tx = await Mina.transaction(feePayer, () => {
    AccountUpdate.fundNewAccount(feePayer);
    let zkapp = new HumanMessage(zkappAddress);
    zkapp.deploy();
  });

  tx.sign([zkappKey]);
  await tx.send().wait();
  isDeployed = true;
}

function getMessage() {
  let zkapp = new HumanMessage(zkappAddress);
  try {
    return zkapp.currentMessage.get();
  } catch {
    return '';
  }
}
