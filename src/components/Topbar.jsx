// src/components/Topbar.jsx
import React from 'react';

export default function Topbar({ onRefresh }) {
  function logoutUser() {
    localStorage.setItem('isLoggedIn', 'false');
    window.location.href = '/public/login.html';
  }
  return (
    <div className="topbar">
      <div className="left">
        <div className="hamburger" id="sidebarToggle" title="Toggle sidebar (click)">
          <div className="lines"><span></span><span></span><span></span></div>
        </div>
        <h1>Blend Dashboard</h1>
      </div>
      <div className="controls">
        <button id="refreshBtn" className="btn" type="button" onClick={onRefresh}>Refresh</button>
        <button id="logoutBtn" className="logout-btn" type="button" onClick={logoutUser}>Logout</button>
      </div>
    </div>
  );
}
