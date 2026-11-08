import React, { useCallback, useEffect, useRef, useState } from 'react';
import NeonGame from '../game/NeonGame.jsx';

const BEST_KEY = 'neon-rider-best';
const fmt = (n) => Math.floor(n || 0).toLocaleString('en-US');

function readBest() {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

function writeBest(score) {
  try {
    localStorage.setItem(BEST_KEY, String(Math.floor(score)));
  } catch {
    /* ignore quota / private mode */
  }
}

export default function App() {
  const canvas = useRef(null);
  const game = useRef(null);
  const [hud, setHud] = useState({
    mode: 'menu',
    distance: 0,
    score: 0,
    speed: 0,
    nitro: 100,
    hits: 0,
  });
  const [sound, setSound] = useState(true);
  const [best, setBest] = useState(() => readBest());

  const onUpdate = useCallback((next) => {
    setHud((prev) => ({ ...prev, ...next }));
    if (next.mode === 'over' && typeof next.score === 'number') {
      setBest((prev) => {
        if (next.score > prev) {
          writeBest(next.score);
          return next.score;
        }
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    try {
      game.current = new NeonGame(canvas.current, onUpdate);
      game.current.setSound(sound);
    } catch (e) {
      console.error('Unable to initialize NEON RIDER', e);
      setHud({ mode: 'error' });
    }
    return () => game.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [onUpdate]);

  useEffect(() => {
    game.current?.setSound(sound);
  }, [sound]);

  const releaseBoost = useCallback(() => {
    game.current?.boost(false);
  }, []);

  useEffect(() => {
    const down = (e) => {
      if (['ArrowLeft', 'ArrowRight', ' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      switch (key) {
        case 'arrowleft':
        case 'a':
          game.current?.setLane(-1);
          break;
        case 'arrowright':
        case 'd':
          game.current?.setLane(1);
          break;
        case ' ':
          game.current?.unlockAudio();
          game.current?.boost(true);
          break;
        case 'escape':
          if (hud.mode === 'running') game.current?.pause();
          else if (hud.mode === 'paused') game.current?.resume();
          break;
        case 'enter':
          if (hud.mode === 'menu' || hud.mode === 'over') {
            game.current?.unlockAudio();
            game.current?.start();
          }
          break;
        default:
          break;
      }
    };
    const up = (e) => {
      if (e.key === ' ') releaseBoost();
    };
    const onBlur = () => releaseBoost();
    const onVisibility = () => {
      if (document.hidden) releaseBoost();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hud.mode, releaseBoost]);

  const start = () => {
    game.current?.unlockAudio();
    game.current?.start();
  };

  const toggleSound = () => {
    game.current?.unlockAudio();
    setSound((s) => !s);
  };

  const bindBoostTouch = {
    onTouchStart: (e) => {
      e.preventDefault();
      game.current?.unlockAudio();
      game.current?.boost(true);
    },
    onTouchEnd: (e) => {
      e.preventDefault();
      releaseBoost();
    },
    onTouchCancel: (e) => {
      e.preventDefault();
      releaseBoost();
    },
    onPointerUp: releaseBoost,
    onPointerCancel: releaseBoost,
    onContextMenu: (e) => e.preventDefault(),
  };

  const isNewBest = hud.mode === 'over' && hud.score > 0 && hud.score >= best && best > 0;

  return (
    <main className="game-shell">
      <canvas ref={canvas} className="world" />
      <div className="vignette" />
      <div className="scanlines" />

      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">N</span>
          <span>
            NEON<span className="brand-lite">RIDER</span>
            <small>GRID RUNNER // 2089</small>
          </span>
        </a>
        <div className="top-right">
          <span className="best-chip" title="Best score">
            BEST <b>{fmt(best)}</b>
          </span>
          <span className="live">
            <i /> LIVE CIRCUIT
          </span>
          <button className="sound" onClick={toggleSound} aria-label="Toggle sound" aria-pressed={sound}>
            {sound ? '♫' : '♪'} <span>SOUND {sound ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </header>

      {hud.mode === 'running' && (
        <>
          <section className="hud-left">
            <div className="metric">
              <span className="label">DISTANCE</span>
              <strong>
                {(hud.distance / 1000).toFixed(2)}
                <small> KM</small>
              </strong>
            </div>
            <div className="metric score">
              <span className="label">SCORE</span>
              <strong>{fmt(hud.score)}</strong>
            </div>
            <div className="metric hits">
              <span className="label">ARMOR</span>
              <strong className="armor-pips" aria-label={`${3 - (hud.hits || 0)} hits remaining`}>
                {[0, 1, 2].map((i) => (
                  <i key={i} className={i < 3 - (hud.hits || 0) ? 'on' : ''} />
                ))}
              </strong>
            </div>
          </section>
          <section className="speed-panel">
            <div className="speed-number">
              {hud.speed}
              <small>KM/H</small>
            </div>
            <div className="speed-track">
              <i style={{ width: `${Math.min(100, hud.speed / 1.8)}%` }} />
            </div>
            <div className="speed-caption">VELOCITY</div>
          </section>
          <section className="nitro-panel">
            <div className="nitro-heading">
              <span>⚡ NITRO SYSTEM</span>
              <b>{Math.round(hud.nitro)}%</b>
            </div>
            <div className="nitro-bar">
              <i style={{ width: `${hud.nitro}%` }} />
            </div>
            <small>{hud.boosting ? 'BOOST ENGAGED' : 'SPACE / HOLD ⚡'}</small>
          </section>
          <div className="pause-hint">
            ESC <span>PAUSE</span>
          </div>
        </>
      )}

      {hud.mode === 'menu' && (
        <>
          <div className="hero">
            <div className="eyebrow">
              <i /> TOKYO // SECTOR 09 <span>•</span> 02:47 AM
            </div>
            <h1>
              OWN THE
              <br />
              <em>NIGHT.</em>
            </h1>
            <p className="hero-copy">
              The city never sleeps. Neither do you.
              <br />
              Command the Light Cycle. Overtake highway traffic.
            </p>
            <div className="best-banner">
              PERSONAL BEST <b>{fmt(best)}</b>
            </div>
            <button className="play-button" onClick={start}>
              <span>START YOUR RIDE</span>
              <b>↗</b>
            </button>
            <div className="start-hint">
              OR PRESS <kbd>ENTER ↵</kbd> TO START
            </div>
          </div>
          <aside className="howto">
            <div className="howto-title">
              <i /> HOW TO PLAY
            </div>
            <div className="howto-row">
              <span className="key-set">
                <kbd>←</kbd>
                <kbd>→</kbd>
              </span>
              <p>
                <b>STEER</b>
                <small>Move between lanes</small>
              </p>
            </div>
            <div className="howto-row">
              <kbd className="wide-key">SPACE</kbd>
              <p>
                <b>NITRO BOOST</b>
                <small>Hold for a burst</small>
              </p>
            </div>
            <div className="howto-row">
              <kbd className="wide-key">ESC</kbd>
              <p>
                <b>PAUSE</b>
                <small>Take a moment</small>
              </p>
            </div>
            <div className="howto-row">
              <span className="key-set">
                <kbd>A</kbd>
                <kbd>D</kbd>
              </span>
              <p>
                <b>ALTERNATE STEER</b>
                <small>WASD is supported too</small>
              </p>
            </div>
            <div className="howto-foot">
              DODGE TRAFFIC <span>◆</span> COLLECT ENERGY <span>◆</span> 3 HITS
            </div>
          </aside>
        </>
      )}

      {hud.mode === 'paused' && (
        <div className="overlay">
          <div className="modal">
            <div className="eyebrow">
              <i /> RIDE SUSPENDED
            </div>
            <h2>
              TAKE A
              <br />
              <em>BREATHER.</em>
            </h2>
            <button className="play-button" onClick={() => game.current?.resume()}>
              <span>RESUME RIDE</span>
              <b>↗</b>
            </button>
            <button
              className="text-button"
              onClick={() => {
                game.current?.unlockAudio();
                game.current?.start();
              }}
            >
              RESTART RUN
            </button>
            <small>PRESS ESC TO RESUME</small>
          </div>
        </div>
      )}

      {hud.mode === 'over' && (
        <div className="overlay">
          <div className="modal">
            <div className="eyebrow">
              <i /> CIRCUIT COMPLETE
            </div>
            <h2>
              RUN
              <br />
              <em>ENDED.</em>
            </h2>
            <div className="result-row">
              <span>DISTANCE</span>
              <b>{(hud.distance / 1000).toFixed(2)} KM</b>
              <span>SCORE</span>
              <b>{fmt(hud.score)}</b>
              <span>BEST</span>
              <b className={isNewBest ? 'new-best' : ''}>
                {fmt(best)}
                {isNewBest ? ' ★' : ''}
              </b>
            </div>
            <button className="play-button" onClick={start}>
              <span>RIDE AGAIN</span>
              <b>↗</b>
            </button>
          </div>
        </div>
      )}

      {hud.mode === 'error' && (
        <div className="overlay">
          <div className="modal">
            <div className="eyebrow">SYSTEM ERROR</div>
            <h2>
              CAN'T LOAD
              <br />
              <em>THE RIDE.</em>
            </h2>
            <p>Try refreshing this page or using a WebGL capable browser.</p>
          </div>
        </div>
      )}

      {hud.mode === 'running' && (
        <div className="touch-controls">
          <button
            type="button"
            aria-label="Steer left"
            onTouchStart={(e) => {
              e.preventDefault();
              game.current?.setLane(-1);
            }}
            onPointerDown={(e) => {
              if (e.pointerType === 'touch') return;
              e.preventDefault();
              game.current?.setLane(-1);
            }}
          >
            ‹
          </button>
          <button type="button" aria-label="Nitro boost" {...bindBoostTouch}>
            ⚡
          </button>
          <button
            type="button"
            aria-label="Steer right"
            onTouchStart={(e) => {
              e.preventDefault();
              game.current?.setLane(1);
            }}
            onPointerDown={(e) => {
              if (e.pointerType === 'touch') return;
              e.preventDefault();
              game.current?.setLane(1);
            }}
          >
            ›
          </button>
        </div>
      )}

      <footer className="footer">
        <span>
          NEON RIDER <b>© 2089</b>
        </span>
        <span>
          BUILT FOR THE AFTER HOURS <i>✳</i>
        </span>
        <span>
          01 <b>/ 03</b>
        </span>
      </footer>
    </main>
  );
}
