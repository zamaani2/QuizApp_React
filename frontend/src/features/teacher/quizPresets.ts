export type QuizPresetType = 'practice' | 'class_test' | 'exam';

export interface QuizPreset {
  id: QuizPresetType;
  title: string;
  tagline: string;
  description: string;
  timerLabel: string;
  attemptsLabel: string;
  resultsLabel: string;
  defaults: {
    time_limit: number;
    max_attempts: number;
    randomize_questions: boolean;
    randomize_answers: boolean;
    show_results_immediately: boolean;
    show_correct_answers: boolean;
    allow_review: boolean;
  };
}

export const QUIZ_PRESETS: Record<QuizPresetType, QuizPreset> = {
  practice: {
    id: 'practice',
    title: 'Practice quiz',
    tagline: 'Self-paced review',
    description: 'Low-stakes practice for students to test understanding and build confidence.',
    timerLabel: 'Untimed',
    attemptsLabel: '3 attempts',
    resultsLabel: 'Score shown right away',
    defaults: {
      time_limit: 0,
      max_attempts: 3,
      randomize_questions: false,
      randomize_answers: false,
      show_results_immediately: true,
      show_correct_answers: false, // revealing correct answers is an explicit choice
      allow_review: true,
    },
  },
  class_test: {
    id: 'class_test',
    title: 'Class test',
    tagline: 'Quick assessment',
    description: 'Timed assessment during class with randomized questions and immediate score only.',
    timerLabel: '30 minutes',
    attemptsLabel: '1 attempt',
    resultsLabel: 'Score only (answers hidden)',
    defaults: {
      time_limit: 30,
      max_attempts: 1,
      randomize_questions: true,
      randomize_answers: false,
      show_results_immediately: true,
      show_correct_answers: false,
      allow_review: true,
    },
  },
  exam: {
    id: 'exam',
    title: 'Exam',
    tagline: 'Formal examination',
    description: 'Strict exam conditions with full shuffling and results hidden until released.',
    timerLabel: '60 minutes',
    attemptsLabel: '1 attempt',
    resultsLabel: 'Results hidden until released',
    defaults: {
      time_limit: 60,
      max_attempts: 1,
      randomize_questions: true,
      randomize_answers: true,
      show_results_immediately: false,
      show_correct_answers: false,
      allow_review: false,
    },
  },
};
