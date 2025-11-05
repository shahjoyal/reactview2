// src/components/Login.jsx
import React, { useState, useEffect } from 'react';

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageColor, setMessageColor] = useState('red');

  useEffect(() => {
    const bgVideo = document.getElementById('bgVideo');
    const playHint = document.getElementById('playHint');

    function tryPlayVideo() {
      if (!bgVideo) return;
      bgVideo.muted = true;
      const playPromise = bgVideo.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (playHint) playHint.style.display = 'none';
          })
          .catch(() => {
            if (playHint) {
              playHint.style.display = 'inline-block';
              playHint.addEventListener(
                'click',
                () => {
                  bgVideo.muted = false;
                  bgVideo.play();
                  playHint.style.display = 'none';
                },
                { once: true }
              );
            }
          });
      }
    }

    tryPlayVideo();
    document.addEventListener('click', tryPlayVideo, { once: true });

    return () => {
      document.removeEventListener('click', tryPlayVideo);
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setMessageColor('red');
      setMessage('Please fill in both fields.');
      return;
    }

    if (email === 'bunkersubmit@abhitech.com' && password === '123456') {
      localStorage.setItem('isLoggedIn', 'true');
      setMessageColor('green');
      setMessage('Login successful!');
      setTimeout(() => onSuccess('auth-token'), 600);
    } else {
      setMessageColor('red');
      setMessage('Invalid email or password.');
    }
  };

  return (
    <div>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; width: 100%; overflow: hidden; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #c6e0ff, #ffffff);
          display: flex; justify-content: center; align-items: center;
          min-height: 100vh; padding-top: 70px;
        }

        .bg-video-wrap {
          position: fixed; inset: 0;
          width: 100%; height: 100%;
          z-index: -2; overflow: hidden;
        }

        #bgVideo {
          position: absolute; top: 50%; left: 50%;
          width: 100%; height: 100%;
          transform: translate(-50%, -50%);
          object-fit: cover;
        }

        .bg-overlay {
          position: fixed; inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.45));
          z-index: -1;
          backdrop-filter: blur(0.5px);
        }

        .navbar {
          width: 100%;
          background-color: rgba(0,70,145,0.92);
          display: flex; align-items: center;
          padding: 10px 30px; color: white;
          position: fixed; top: 0; left: 0; height: 70px;
          z-index: 20; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          animation: slideDown 1s ease forwards; gap: 12px;
        }

        .navbar img { height: 50px; margin-right: 12px; animation: bounce 2s infinite; }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform: translateY(-8px);} }
        .navbar h1 { font-size: 22px; letter-spacing: 1px; animation: fadeIn 1.5s ease forwards; opacity: 0; }
        @keyframes fadeIn { to { opacity: 1; } }
        @keyframes slideDown { 0% { transform: translateY(-100px); opacity: 0 } 100% { transform: translateY(0); opacity: 1 } }

        .login-container {
          background: rgba(255,255,255,0.88);
          padding: 60px 35px 40px;
          border-radius: 20px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.22);
          width: 100%;
          max-width: 420px;
          text-align: center;
          transition: transform 0.3s, box-shadow 0.3s;
          opacity: 0;
          animation: fadeInUp 1s forwards 0.5s;
          position: relative;
          z-index: 10;
          backdrop-filter: blur(6px);
        }

        .login-container:hover { transform: translateY(-5px); box-shadow: 0 24px 50px rgba(0,0,0,0.28); }
        @keyframes fadeInUp { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }

        .login-logo { width: 125px; height: 125px; position: absolute; top: -15px; left: 50%; transform: translateX(-50%); animation: floatLogo 2s ease-in-out infinite; }
        .login-logo img { width: 100%; height: 100%; object-fit: contain; }
        @keyframes floatLogo { 0%,100%{ transform: translate(-50%, -40px); } 50%{ transform: translate(-50%, -50px); } }

        h2 { color: #004691; font-size: 28px; margin-top: 50px; margin-bottom: 30px; letter-spacing: 1px; position: relative; }
        h2::after { content: ''; display: block; width: 60px; height: 3px; background: #004691; margin: 8px auto 0; border-radius: 2px; animation: expandLine 1s ease forwards; }
        @keyframes expandLine { 0% { width: 0; } 100% { width: 60px; } }

        input {
          width: 100%;
          padding: 14px 16px;
          margin: 12px 0;
          border: 2px solid #ccc;
          border-radius: 12px;
          font-size: 16px;
          transition: all 0.25s;
          background: rgba(255,255,255,0.9);
        }
        input:focus { border-color: #004691; box-shadow: 0 0 12px rgba(0,70,145,0.18); }

        button {
          background: #004691;
          width: 100%;
          font-size: 18px;
          border-radius: 12px;
          padding: 14px;
          color: white;
          border: none;
          cursor: pointer;
          transition: all 0.25s, box-shadow 0.3s;
          margin-top: 10px;
        }
        button:hover { background-color: #013b79; transform: scale(1.03); box-shadow: 0 6px 20px rgba(0,0,0,0.2); }

        #message { color: ${messageColor}; font-size: 14px; margin-top: 10px; min-height: 18px; transition: all 0.3s; }

        .footer { margin-top: 14px; color: #666; font-size: 13px; }
        .video-play-hint {
          display: none;
          margin-top: 12px;
          font-size: 13px;
          color: #fff;
          background: rgba(1,59,121,0.85);
          padding: 8px 12px;
          border-radius: 999px;
        }
      `}</style>

      <div className="bg-video-wrap" aria-hidden="true">
        <video
          id="bgVideo"
          autoPlay
          muted
          loop
          playsInline
          poster="/coalbunkering.jpg"
        >
          <source src="/coalbunkering.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>

      <div className="bg-overlay" aria-hidden="true"></div>

      <div className="navbar" role="banner">
        <img src="/images/abhitech-logo.png" alt="Abhitech logo" />
        <h1>ABCD-Advanced Bunkering and Coal Database</h1>
      </div>

      <div className="login-container" role="main">
        <div className="login-logo">
          <img src="/images/abhitech-logo.png" alt="" />
        </div>
        <h2>LOGIN</h2>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Login</button>
        </form>

        <div id="message" style={{ color: messageColor }}>
          {message}
        </div>

        <div id="playHint" className="video-play-hint">
          Tap to play background video for motion.
        </div>

        <div className="footer">© 2025 Abhitech Energycon Limited</div>
      </div>
    </div>
  );
}
