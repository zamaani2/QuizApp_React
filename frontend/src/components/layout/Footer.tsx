import type { FC } from 'react';

export const Footer: FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="core-footer">
      <span>School Management System</span>
      <span><strong>Copyright &copy; {currentYear} Cissey-Tech.</strong> All rights reserved.</span>
    </footer>
  );
};
