import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import Navigation from './src/screens/Navigation';
import SplashScreen from './src/screens/SplashScreen';
import { initRAG } from './src/services/rag';

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  // Pre-load RAG index during splash so first query has no cold-start delay.
  useEffect(() => {
    initRAG().catch(e => console.warn('[RAG] init failed:', e));
  }, []);

  if (!splashDone) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#212121" />
        <SplashScreen onDone={() => setSplashDone(true)} />
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#212121" />
      <Navigation />
    </>
  );
}
