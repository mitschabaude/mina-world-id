import {
  Field,
  method,
  SmartContract,
  State,
  state,
  Experimental,
  Struct,
  Poseidon,
  Signature,
  PrivateKey,
} from 'snarkyjs';

export { Semaphore };

// a semaphore "private key" / "identity" consists of two 31 byte numbers: trapdoor and nullifier.
// we represent those as Fields (elements of the Vesta curve base field), which can hold 254 bits > 31 bytes
class SemaphorePrivateKey extends Struct({
  trapdoor: Field,
  nullifier: Field,
}) {}

// the world id merkle root which gets signed by worldcoin's "signup sequencer"
// signing uses the Pasta curves
class SignedMerkleRoot extends Struct({
  root: Field,
  signature: Signature,
}) {}

// witness of inclusion in the identity "group" / merkle tree of public keys
// TODO: what's the tree height?
class MerklePath extends Experimental.MerkleWitness(8) {}

class Semaphore extends SmartContract {
  /**
   * merkle root or the tree which stores identities
   * == the big semaphore group containing all the unique humans
   * this is supposed to be synced with the world id merkle tree
   */
  @state(Field) root = State<Field>();

  events = { signal: Field };

  trustedServerPublicKey = PrivateKey.random().toPublicKey();

  async fetchWorldIdRoot() {
    // TODO: mock server
    let root = Field.random();
    let pk = PrivateKey.random();
    let signature = Signature.create(pk, [root]);
    return new SignedMerkleRoot({ root, signature });
  }

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
   * checking that the nullifier wasn't used before is up to whoever calls this zkapp
   * (if it's another zkapp, it could prove non membership in a sparse merkle tree which it maintains, for example)
   *
   * finally, the method takes a "signal" which is emitted as an event, to potentially connect the proof
   * to an application-specific message.
   * (note: if this is called by another zkapp, and the two zkps validated together on Mina,
   * then "signal" can be left zero, since the caller zkapp will include whatever signals / events / actions it associates
   * with this method call in its own logic. however, "signal" is needed to link app-specific data to a
   * stand-alone proof, which is to be verified outside Mina)
   */
  @method proveUniqueHuman(
    privateKey: SemaphorePrivateKey,
    merklePath: MerklePath,
    signedMerkleRoot: SignedMerkleRoot,
    externalNullifier: Field,
    signal: Field
  ) {
    // hash together trapdoor & nullifier to get the "public key" == merkle leaf
    // TODO: this is NOT compatible with world id public keys right now, bc world id uses Poseidon on its BN curve for this hash.
    // eventually, world id will switch to blake2b, and snarkyjs will implement blake2b to be able to derive compatible
    // public keys. OR (maybe even better), world id publishes a Mina compatible Merkle tree alongside its normal one
    let publicKey = Poseidon.hash([privateKey.trapdoor, privateKey.nullifier]);

    // check that the public key is contained in identity group, by asserting it equals the signed root
    // by adding a precondition that the implied root is the one stored on this contract
    let impliedRoot = merklePath.calculateRoot(publicKey);
    signedMerkleRoot.root.assertEquals(impliedRoot);

    // check the signature on the merkle root
    signedMerkleRoot.signature
      .verify(this.trustedServerPublicKey, [signedMerkleRoot.root])
      .assertTrue();

    // publish the input as an event, so its connected to this circuit
    this.emitEvent('signal', signal);

    // compute the nullifier hash and return it
    let nullifierHash = Poseidon.hash([
      privateKey.nullifier,
      externalNullifier,
    ]);
    return nullifierHash;
  }
}