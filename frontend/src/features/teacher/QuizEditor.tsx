import React from 'react';
import { useParams } from 'react-router-dom';
import { QuizCreate } from './QuizCreate';
import { QuizSettings } from './QuizSettings';

/**
 * QuizEditor delegates to QuizCreate for new quizzes (/teacher/quizzes/new)
 * and QuizSettings for existing quizzes (/teacher/quizzes/:id/settings).
 * The old 4-step, 25-field wizard and classes multi-select have been retired.
 */
export const QuizEditor: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  if (id) {
    return <QuizSettings />;
  }
  return <QuizCreate />;
};
