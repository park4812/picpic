import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="home">
      <div className="home-logo">404</div>
      <div className="home-sub">페이지를 찾을 수 없습니다</div>
      <Link to="/" className="btn-primary" style={{ textDecoration: 'none', padding: '14px 32px' }}>홈으로 돌아가기</Link>
    </div>
  );
}
