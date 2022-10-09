import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Field } from 'snarkyjs';

// some style params
let primary = '#ee9999';
let grey = '#cccccc';
let darkGrey = '#999999';

type View = 'None' | 'Orb' | 'Captcha' | 'Speak';
let views: View[] = ['Orb', 'Captcha', 'Speak'];
let startView: View = 'None';

type Snarky = typeof import('snarkyjs');
let snarky: Snarky;
let SmartContractModule: typeof import('../index');
let WorldId: typeof import('../index')['WorldId'];

const sequencerUrl = 'http://localhost:3000';

createRoot(document.querySelector('#root')!).render(<App />);

function App() {
  let [view, setView] = useState<View>(startView);
  let [isReady, setIsReady] = useState(false);
  let [, reload] = useState(0);
  useEffect(() => {
    // asnychronously load snarkyjs
    (async () => {
      SmartContractModule = await import('../../build/src/index.js');
      ({ snarky, WorldId } = SmartContractModule);
      await snarky.isReady;
      setIsReady(true);
    })();
    (async () => {
      // meanwhile, clean out locally stored public keys that aren't in the global merkle tree
      let identities: Identity[] = JSON.parse(localStorage.worldIds ?? '[]');
      let promises = identities.map(async ({ publicKey }) => {
        let res = await fetch(`${sequencerUrl}/has-public-key`, {
          method: 'POST',
          body: JSON.stringify({ publicKey }),
        });
        if (!(await res.json())) {
          identities.splice(
            identities.findIndex((i) => i.publicKey === publicKey),
            1
          );
        }
      });
      await Promise.all(promises);
      localStorage.worldIds = JSON.stringify(identities);
      reload((i) => i + 1);
    })();
  }, []);
  let View = ({ Orb, Captcha, Speak } as any)[view] ?? null;
  return (
    <Container>
      <h1 style={{ textAlign: 'center' }}>
        mina <span style={{ fontFamily: 'sans-serif' }}>❤️</span> world id
      </h1>
      <Space h="1rem" />

      <p style={{ textAlign: 'center' }}>
        Try out three demos to explore the use of World ID on Mina:
      </p>
      <Space h="2rem" />
      <Layout>
        <Navigation view={view} setView={setView} />
        {View && isReady && <View />}
      </Layout>
    </Container>
  );
}

// <></>

function Orb() {
  let [name, setName] = useState('');
  let [isLoading, setLoading] = useState(false);
  let { Poseidon, Encoding } = snarky;
  let irisHash = Poseidon.hash(Encoding.stringToFields(name ?? ''));

  async function createId(e: any) {
    e?.preventDefault();
    setLoading(true);
    try {
      let { privateKey, publicKey } = WorldId.generateKeypair();
      let res = await WorldId.postPublicKey(sequencerUrl, publicKey, irisHash);
      if (res.ok) {
        let worldIds = JSON.parse(localStorage.worldIds ?? '[]');
        worldIds.push({ name, privateKey, publicKey });
        localStorage.worldIds = JSON.stringify(worldIds);
      }
    } finally {
      setLoading(false);
    }
  }
  return (
    <form
      onSubmit={createId}
      style={{ display: 'flex', alignItems: 'center', flexDirection: 'column' }}
    >
      <p style={{ textAlign: 'center' }}>
        This is a fake placeholder for what a real orb does: Instead of scanning
        your iris, we derive the "iris hash" from the name you type in.
      </p>
      <Space h="2rem" />
      <input
        type="text"
        placeholder="Your Name"
        style={{ height: '3rem', fontSize: '1.5rem', paddingLeft: '0.8rem' }}
        value={name}
        onChange={(v) => setName(v.target.value)}
      ></input>
      <Space h="1rem" />
      <p style={{ textAlign: 'center' }}>
        Iris hash:
        <b> {shortHex(irisHash)}</b>
      </p>
      <Space h="2rem" />
      <LoadingButton isLoading={isLoading} disabled={!name}>
        Create ID
      </LoadingButton>
    </form>
  );
}

type StoredPrivateKey = { trapdoor: string; nullifier: string };

type Identity = {
  name: string;
  publicKey: Field;
  privateKey: StoredPrivateKey;
};

function Captcha() {
  let [isSuccess, setSuccess] = useState(false);
  let [isLoading, setLoading] = useState(false);

  let worldIds: Identity[] = useMemo(
    () => JSON.parse(localStorage.worldIds ?? '[]'),
    []
  );
  async function createAndVerifyCaptchaProof(
    privateKey: { trapdoor: string; nullifier: string },
    publicKey: Field
  ) {
    let { Mina, PrivateKey, Field, verify } = snarky;
    let { SemaphorePrivateKey } = SmartContractModule;

    setLoading(true);
    try {
      let { witness, signedRoot } = await WorldId.fetchMerkleProof(
        sequencerUrl,
        publicKey
      );

      await WorldId.compile();

      let worldId = new WorldId(PrivateKey.random().toPublicKey());
      let privateKey_ = SemaphorePrivateKey.fromJSON(privateKey)!;

      let tx = await Mina.transaction(() => {
        worldId.provePersonhood(
          privateKey_,
          witness,
          signedRoot,
          Field.zero,
          Field.zero
        );
      });
      let [proof] = await tx.prove();
      let ok = await verify(proof!, WorldId._verificationKey!.data);
      setSuccess(ok);
    } finally {
      setLoading(false);
    }
  }

  if (isSuccess)
    return (
      <>
        <Space h="2rem" />
        <h1>You did it! 🥳</h1>
      </>
    );
  return (
    <>
      <p style={{ textAlign: 'center' }}>
        Log in by showing a <i>proof of personhood</i> -- a zk proof that your
        browser-stored identity is contained in the Merkle tree of public keys
        maintained by the World ID sequencer.
      </p>
      <Space h="2rem" />
      {worldIds.length === 0 && (
        <p style={{ textAlign: 'center', fontWeight: 'bold', color: darkGrey }}>
          You don't have an identity yet! Create one at the "Orb" tab.
        </p>
      )}
      {worldIds.map((id) => {
        return (
          <div key={id.name}>
            <LoadingButton
              onClick={() =>
                createAndVerifyCaptchaProof(id.privateKey, id.publicKey)
              }
              isLoading={isLoading}
            >
              Login as {id.name}
            </LoadingButton>
            <Space h="1rem" />
          </div>
        );
      })}
      <Space h="1rem" />
      {worldIds.length > 0 && (
        <p style={{ textAlign: 'center', fontSize: '0.8rem' }}>
          This is a somewhat silly example because the same website that
          verifies the proof also creates it. In a real-world scenario, the
          proof could come from a wallet.
        </p>
      )}
    </>
  );
}

function Speak() {
  let {
    SemaphorePrivateKey,
    HumanMessage,
    deployHumanMessage,
    StringOf7Fields,
    zkappAddress,
    getMessage,
    feePayer,
  } = SmartContractModule;
  let [message, setMessage] = useState('');
  let [lastMessage, setLastMessage] = useState('No message yet');
  let worldIds: Identity[] = useMemo(
    () => JSON.parse(localStorage.worldIds ?? '[]'),
    []
  );
  let [isLoading, setLoading] = useState(false);
  useEffect(() => {
    let last = getMessage();
    setLastMessage(last!.toString());
  }, [isLoading]);

  async function publishMessageProof(
    privateKey: { trapdoor: string; nullifier: string },
    publicKey: Field
  ) {
    let { Mina } = snarky;

    setLoading(true);
    try {
      let { witness, signedRoot } = await WorldId.fetchMerkleProof(
        sequencerUrl,
        publicKey
      );
      await deployHumanMessage();

      let zkapp = new HumanMessage(zkappAddress);
      let privateKey_ = SemaphorePrivateKey.fromJSON(privateKey)!;

      let tx = await Mina.transaction(feePayer, () => {
        zkapp.publishMessage(
          StringOf7Fields.from(message),
          privateKey_,
          witness,
          signedRoot
        );
      });
      await tx.prove();
      await tx.send().wait();
      setLoading(false);
      setMessage('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <p style={{ textAlign: 'center' }}>
        Write a message for the world on this wall, anonymously and
        censorship-resistant! To give everyone a chance, the same person can't
        write two messages in a row.
      </p>
      <Space h="2rem" />
      <input
        type="text"
        placeholder="Your Message"
        style={{ height: '3rem', fontSize: '1.5rem', paddingLeft: '0.8rem' }}
        value={message}
        onChange={(v) => setMessage(v.target.value)}
      ></input>
      <Space h="2rem" />
      {worldIds.length === 0 && (
        <p style={{ textAlign: 'center', fontWeight: 'bold', color: darkGrey }}>
          You don't have an identity yet! Create one at the "Orb" tab.
        </p>
      )}
      {worldIds.map((id) => {
        return (
          <div key={id.name}>
            <LoadingButton
              onClick={() => publishMessageProof(id.privateKey, id.publicKey)}
              isLoading={isLoading}
            >
              Speak as {id.name}
            </LoadingButton>
            <Space h="1rem" />
          </div>
        );
      })}
      <Space h="2rem" />
      {lastMessage !== '' && (
        <>
          <p style={{ textAlign: 'center' }}>
            Here's what the last person had to say:
          </p>
          <Space h="2rem" />
          <p style={{ textAlign: 'center', fontStyle: 'italic' }}>
            <b style={{ fontSize: '2rem' }}>"</b>
            {lastMessage}
            <b style={{ fontSize: '2rem' }}>"</b>
          </p>
        </>
      )}
    </>
  );
}

function shortHex(x: Field) {
  let full = x.toBigInt().toString(16);
  return `0x${full.slice(0, 4)}..${full.slice(-4)}`;
}

// pure UI components

function Navigation({ view, setView }: any) {
  return (
    <div style={{ position: 'relative' }}>
      <h2 style={{ fontSize: '30px', textAlign: 'center' }}>
        {views.map((v, i) => (
          <span key={v}>
            <a
              style={{
                cursor: 'pointer',
                ...(v === view && { color: primary }),
              }}
              onClick={() => setView(v)}
            >
              {v}
            </a>
            {i < views.length - 1 ? ' | ' : ''}
          </span>
        ))}
      </h2>
    </div>
  );
}

function LoadingButton({ disabled = false, isLoading, ...props }: any) {
  return <Button {...{ disabled: disabled || isLoading, ...props }} />;
}

function Button({ disabled = false, ...props }) {
  return (
    <button
      className="highlight"
      style={{
        color: disabled ? darkGrey : 'black',
        fontSize: '1.5rem',
        fontWeight: 'bold',
        backgroundColor: disabled ? 'white !important' : 'white',
        borderRadius: '10px',
        paddingTop: '15px',
        paddingBottom: '15px',
        minWidth: '20rem',
        border: disabled ? `2px ${darkGrey} solid` : '2px black solid',
        boxShadow: `${grey} 3px 3px 3px`,
        cursor: disabled ? undefined : 'pointer',
      }}
      disabled={disabled}
      {...props}
    />
  );
}

function Container(props: any) {
  return (
    <div
      style={{
        maxWidth: '900px',
        margin: 'auto',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        padding: '2rem',
      }}
      {...props}
    />
  );
}

function Layout({ children }: any) {
  let [header, main] = children;
  return (
    <>
      {header}
      <Space h="2rem" />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexDirection: 'column',
        }}
      >
        {main}
      </div>
    </>
  );
}

function Space({ w, h }: { w?: string; h?: string }) {
  return <div style={{ width: w, height: h }} />;
}
