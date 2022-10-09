import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Field } from 'snarkyjs';

// some style params
let primary = '#ee9999';
let grey = '#cccccc';
let darkGrey = '#999999';

type View = 'None' | 'Orb' | 'Captcha' | 'Speak';
let views: View[] = ['Orb', 'Captcha', 'Speak'];
let startView: View = 'Orb';

type Snarky = typeof import('snarkyjs');
let snarky: Snarky;
let WorldId: typeof import('../WorldId')['WorldId'];

const sequencerUrl = 'http://localhost:3000';

createRoot(document.querySelector('#root')!).render(<App />);

function App() {
  let [view, setView] = useState<View>(startView);
  let [isReady, setIsReady] = useState(false);
  useEffect(() => {
    (async () => {
      ({ WorldId, snarky } = await import('../../build/src/WorldId.js'));
      await snarky.isReady;
      setIsReady(true);
    })();
  }, []);
  let View = ({ Orb } as any)[view] ?? null;
  return (
    <Container>
      <h1 style={{ textAlign: 'center' }}>mina ❤️ world id</h1>
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
  let { Poseidon, Encoding } = snarky;
  let irisHash = Poseidon.hash(Encoding.stringToFields(name ?? ''));

  async function createId(e: any) {
    e?.preventDefault();
    let { privateKey, publicKey } = WorldId.generateKeypair();
    await WorldId.postPublicKey(sequencerUrl, publicKey, irisHash);
    let worldIds = JSON.parse(localStorage.worldIds ?? '[]');
    worldIds.push({ name, irisHash, privateKey, publicKey });
    localStorage.worldIds = JSON.stringify(worldIds);
  }
  return (
    <form
      onSubmit={createId}
      style={{ display: 'flex', alignItems: 'center', flexDirection: 'column' }}
    >
      <p style={{ textAlign: 'center' }}>
        This is a silly replacement of what a real orb does: Instead of scanning
        your iris, it derives the "iris hash" from the name you type in.
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
      <LoadingButton>Create ID</LoadingButton>
    </form>
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

function LoadingButton({ disabled = false, onClick, ...props }: any) {
  let [isLoading, setIsLoading] = useState(false);
  async function onClickLoading() {
    setIsLoading(true);
    await onClick?.();
    setIsLoading(false);
  }
  return (
    <Button
      {...{
        onClick: onClickLoading,
        disabled: disabled || isLoading,
        ...props,
      }}
    />
  );
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
