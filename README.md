# Mina World ID

This project aims at integrating the [World ID](https://id.worldcoin.org/) proof of personhood (PoP) system into snarkyjs, to make PoP available on Mina smart contracts and other applications built with snarkyjs zk circuits.

The core building block here is the [Semaphore](https://semaphore.appliedzkp.org/) circuit which takes in a Semaphore "private key", derives a corresponding public key and demonstrates inclusion in a certain Merkle tree. You can find a snarkyjs version of that circuit at https://github.com/mitschabaude/mina-world-id/blob/main/src/WorldId.ts

## How it works

In World ID, every public key in the mentioned Merkle tree represents a unique human, identified by a plausibly tamper-resistant iris hash, derived from an iris scan and signed on the trusted hardware of the [Worldcoin orb](https://worldcoin.org/how-the-launch-works#hardware). Upon receiving such a signed public key by an orb, the sequencer inserts it into the Merkle tree. The validity of the Merkle root can be proven in zk by checking a signature of the sequencer, which owns a certain (hard-coded) public key, on the Merkle root. This is done in the Semaphore circuit, which also proves inclusion in the same Merkle tree, thus making it highly plausible that the creator of the proof is a unique human.

To have an e2e demo of the system we implemented a mock sequencer in https://github.com/mitschabaude/mina-world-id/blob/main/src/sequencer.js

There's also an [example UI](https://github.com/mitschabaude/mina-world-id/blob/main/src/example-ui) and a very trivial [example zkApp](https://github.com/mitschabaude/mina-world-id/blob/main/src/HumanMessage.ts) which uses the PoP and associated nullifier to prevent the same user from performing an action twice in a row.

## TODOs

To really make World IDs available for Mina zkApps, essentially two things are missing.

- First, there needs to be get private keys which are actually authorized by an orb, into snarkyjs circuits. For example, the private key could be created by a snarkyjs-enabled wallet which also created zkApp proofs using that private key. Alternatively, there could be a system of signing some challenge with the private key, which can be checked in zk.
- Since World ID's current public keys and Merkle tree are based on a hash function which is (probably) infeasible to use in [Mina's proof system](https://o1-labs.github.io/proof-systems/), we need to sync and publish a separate Merkle tree alongside it, built with Poseidon hashes in the [Pallas base field](https://o1-labs.github.io/proof-systems/specs/pasta.html).

## How to run the example

```sh
# install and build TS
npm i
npx tsc

# start up the sequencer (stores merkle tree of public keys in memory)
node src/sequencer.js

# build/watch and serve the example React UI
npm run ui:start

# UI runs on http://localhost:4000
```
