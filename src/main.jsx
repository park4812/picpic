import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth';
import Home from './pages/Home';
import Post from './pages/Post';
import Admin from './pages/Admin';
import Login from './pages/Login';
import Recruit from './pages/Recruit';
import MyPamphlets from './pages/MyPamphlets';
import MyPosts from './pages/MyPosts';
import Sketch from './pages/Sketch';
import NotFound from './pages/NotFound';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/p/:postId" element={<Post />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/login" element={<Login />} />
          <Route path="/recruit" element={<Recruit />} />
          <Route path="/recruit/:pamId" element={<Recruit />} />
          <Route path="/my-pamphlets" element={<MyPamphlets />} />
          <Route path="/my-posts" element={<MyPosts />} />
          <Route path="/sketch" element={<Sketch />} />
          <Route path="/sketch/:boardId" element={<Sketch />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
