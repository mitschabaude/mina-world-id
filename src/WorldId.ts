import {
  Field,
  method,
  SmartContract,
  Experimental,
  Poseidon,
  Signature,
  PublicKey,
  Bool,
  CircuitValue,
  prop,
} from 'snarkyjs';
import { MERKLE_TREE_HEIGHT } from './constants.js';

export { WorldId, SemaphorePrivateKey, SignedMerkleRoot, MerkleWitness };
export * as snarky from 'snarkyjs';

// a semaphore "private key" / "identity" consists of two 31 byte numbers: trapdoor and nullifier.
// we represent those as Fields (elements of the Vesta curve base field), which can hold 254 bits > 31 bytes
class SemaphorePrivateKey extends CircuitValue {
  @prop trapdoor: Field;
  @prop nullifier: Field;
}

// the world id merkle root which gets signed by worldcoin's "signup sequencer"
// signing uses the Pasta curves
class SignedMerkleRoot extends CircuitValue {
  @prop root: Field;
  @prop signature: Signature;
}

// witness of inclusion in the identity "group" / merkle tree of public keys
class MerkleWitness extends Experimental.MerkleWitness(MERKLE_TREE_HEIGHT) {}

class WorldId extends SmartContract {
  events = { signal: Field };

  sequencerPublicKey = PublicKey.fromBase58(
    'B62qqtPPmKENZiE39zNKqzydrj2MhBa1AngUCzU2HT1YRjihgbRWrvM'
  );

  /**
   * the circuit which proves the user is a unique human (== has a world id)
   *
   * it takes a semaphore "identity", which are two 31 byte numbers called trapdoor and nullifier.
   * we represent those as Fields (elements of the Vesta curve base field), which can hold 254 bits > 31 bytes.
   *
   * alongside the identity, you need to provide a merkle path with a merkle root signed by the world id server,
   * which proves that your public key was signed by an Orb after scanning your iris,
   *
   * this method also takes an "external nullifier" and returns a "nullifier hash", which can be used by the application
   * to check that this user performs a unique action.
   *
   * checking that the nullifier wasn't used before is up to whoever calls this method
   * (if it's another zkapp, it could prove non membership in a sparse merkle tree which it maintains, for example)
   *
   * finally, the method takes a "signal" which is emitted as an event, to potentially connect the proof
   * to an application-specific message.
   * (note: if this is called by another zkapp, and the two zkps validated together on Mina,
   * then "signal" can be left zero, since the caller zkapp will include whatever signals / events / actions it associates
   * with this method call in its own logic. however, "signal" is needed to link app-specific data to a
   * stand-alone proof, which is to be verified outside Mina)
   */
  @method provePersonhood(
    privateKey: SemaphorePrivateKey,
    // TODO: when we support async circuits, we can fetch the merkle proof inside this method
    merklePath: MerkleWitness,
    signedRoot: SignedMerkleRoot,
    externalNullifier: Field,
    signal: Field
  ) {
    // publish the input signal as an event, so it's connected to this circuit
    this.emitEvent('signal', signal);

    return this.provePersonhoodBase(
      privateKey,
      merklePath,
      signedRoot,
      externalNullifier
    );
  }

  /**
   * core part which only does the proof of personhood, not the event,
   * and which is not a standalone method => can be included in other
   * zkapp circuits without the overhead of creating a second proof
   */
  provePersonhoodBase(
    privateKey: SemaphorePrivateKey,
    // TODO: when we support async circuits, we can fetch the merkle proof inside this method
    // that would clean up the interface
    merklePath: MerkleWitness,
    signedRoot: SignedMerkleRoot,
    externalNullifier: Field
  ) {
    // hash together trapdoor & nullifier to get the "public key" == merkle leaf
    // TODO: this is NOT compatible with world id public keys right now, bc world id uses Poseidon on its BN curve for this hash.
    // eventually, world id will switch to blake2b, and snarkyjs will implement blake2b to be able to derive compatible
    // public keys. OR (maybe even better), world id publishes a Mina compatible Merkle tree alongside its normal one
    let publicKey = Poseidon.hash([privateKey.trapdoor, privateKey.nullifier]);

    // check that the public key is contained in identity group, by asserting it equals the signed root
    // by adding a precondition that the implied root is the one stored on this contract
    let impliedRoot = merklePath.calculateRoot(publicKey);
    signedRoot.root.assertEquals(impliedRoot);

    // check the signature on the merkle root
    signedRoot.signature
      .verify(this.sequencerPublicKey, [signedRoot.root])
      .assertTrue();

    // compute the nullifier hash and return it
    let nullifierHash = Poseidon.hash([
      privateKey.nullifier,
      externalNullifier,
    ]);
    return nullifierHash;
  }

  // helper method to generate an identity / a keypair
  static generateKeypair() {
    let privateKey = { trapdoor: Field.random(), nullifier: Field.random() };
    let publicKey = Poseidon.hash([privateKey.trapdoor, privateKey.nullifier]);
    return { privateKey, publicKey };
  }

  // helper method to insert new publicKey
  static async postPublicKey(
    sequencerUrl: string,
    publicKey: Field,
    irisHash: Field
  ) {
    return await fetch(`${sequencerUrl}/insert`, {
      method: 'POST',
      body: JSON.stringify({ irisHash, publicKey }),
    });
  }

  // helper method to get the merkle witness from the sequencer
  static async fetchMerkleProof(sequencerUrl: string, publicKey: Field) {
    let response = await fetch(`${sequencerUrl}/proof`, {
      method: 'POST',
      body: JSON.stringify({ publicKey }),
    });
    let json = await response.json();
    let root = Field.fromJSON(json.root)!;
    let signature = Signature.fromJSON(json.signature)!;
    // TODO: fromJSON not implemented on arrays
    let witness = json.witness.map((node: any) => ({
      isLeft: Bool(node.isLeft),
      sibling: Field(node.sibling),
    }));
    return {
      witness: new MerkleWitness(witness),
      signedRoot: new SignedMerkleRoot(root, signature),
    };
  }
}
