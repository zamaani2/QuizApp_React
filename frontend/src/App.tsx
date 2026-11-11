import { AppIcon } from './components/common/AppIcon';
import { useState, lazy, Suspense, type FC } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, RoleGuard } from './auth';
import './features/assessment.css';
import {
  StudentAppLayout,
  TeacherAppLayout,
  AdminAppLayout,
  Button,
  Alert,
  Modal,
  DataTable,
  type Column,
  LoadingSpinner,
} from './components';

// Code-split per role area (Section 4.6)
// Superadmin features
const SchoolList = lazy(() =>
  import('./features/superadmin/SchoolList').then((m) => ({ default: m.SchoolList }))
);
const AdminList = lazy(() =>
  import('./features/superadmin/AdminList').then((m) => ({ default: m.AdminList }))
);
const SuperadminAdminDetail = lazy(() =>
  import('./features/superadmin/AdminDetail').then((m) => ({ default: m.AdminDetail }))
);
const SuperadminAdminForm = lazy(() =>
  import('./features/superadmin/AdminForm').then((m) => ({ default: m.AdminForm }))
);
const SuperadminDashboard = lazy(() =>
  import('./features/superadmin/SuperadminDashboard').then((m) => ({ default: m.SuperadminDashboard }))
);
const SchoolDetail = lazy(() =>
  import('./features/superadmin/SchoolDetail').then((m) => ({ default: m.SchoolDetail }))
);
const SchoolForm = lazy(() =>
  import('./features/superadmin/SchoolForm').then((m) => ({ default: m.SchoolForm }))
);

// Admin features
const AdminDashboard = lazy(() =>
  import('./features/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const StudentList = lazy(() =>
  import('./features/admin/StudentList').then((m) => ({ default: m.StudentList }))
);
const TeacherList = lazy(() =>
  import('./features/admin/TeacherList').then((m) => ({ default: m.TeacherList }))
);
const UserList = lazy(() =>
  import('./features/admin/UserList').then((m) => ({ default: m.UserList }))
);
const AcademicYearsManager = lazy(() =>
  import('./features/admin/AcademicYearsManager').then((m) => ({ default: m.AcademicYearsManager }))
);
const TermsManager = lazy(() =>
  import('./features/admin/TermsManager').then((m) => ({ default: m.TermsManager }))
);
const ClassesManager = lazy(() =>
  import('./features/admin/ClassesManager').then((m) => ({ default: m.ClassesManager }))
);
const ClassDetailView = lazy(() =>
  import('./features/admin/ClassDetailView').then((m) => ({ default: m.ClassDetailView }))
);
const SubjectsManager = lazy(() =>
  import('./features/admin/SubjectsManager').then((m) => ({ default: m.SubjectsManager }))
);
const StructureManager = lazy(() =>
  import('./features/admin/StructureManager').then((m) => ({ default: m.StructureManager }))
);
const SchoolSettingsView = lazy(() =>
  import('./features/admin/SchoolSettingsView').then((m) => ({ default: m.SchoolSettingsView }))
);
const StudentEnrollmentsManager = lazy(() =>
  import('./features/admin/StudentEnrollmentsManager').then((m) => ({ default: m.StudentEnrollmentsManager }))
);
const TeacherAssignmentsManager = lazy(() =>
  import('./features/admin/TeacherAssignmentsManager').then((m) => ({ default: m.TeacherAssignmentsManager }))
);

// Teacher features
const TeacherDashboard = lazy(() =>
  import('./features/teacher/TeacherDashboard').then((m) => ({ default: m.TeacherDashboard }))
);
const QuizList = lazy(() =>
  import('./features/teacher/QuizList').then((m) => ({ default: m.QuizList }))
);
const QuizDetail = lazy(() =>
  import('./features/teacher/QuizDetail').then((m) => ({ default: m.QuizDetail }))
);
const QuizEditor = lazy(() =>
  import('./features/teacher/QuizEditor').then((m) => ({ default: m.QuizEditor }))
);
const QuestionEditor = lazy(() =>
  import('./features/teacher/QuestionEditor').then((m) => ({ default: m.QuestionEditor }))
);
const QuestionImport = lazy(() =>
  import('./features/teacher/QuestionImport').then((m) => ({ default: m.QuestionImport }))
);
const QuizAssignments = lazy(() =>
  import('./features/teacher/QuizAssignments').then((m) => ({ default: m.QuizAssignments }))
);
const GradingAttempt = lazy(() =>
  import('./features/teacher/GradingAttempt').then((m) => ({ default: m.GradingAttempt }))
);
const QuizResultDetail = lazy(() =>
  import('./features/teacher/QuizResultDetail').then((m) => ({ default: m.QuizResultDetail }))
);
const TeacherQuizResultPrint = lazy(() =>
  import('./features/QuizResultPrint').then((m) => ({ default: m.TeacherQuizResultPrint }))
);
const TeacherQuizResultsBulkPrint = lazy(() =>
  import('./features/QuizResultPrint').then((m) => ({ default: m.TeacherQuizResultsBulkPrint }))
);
const QuizResultsList = lazy(() =>
  import('./features/teacher/QuizResultsList').then((m) => ({ default: m.QuizResultsList }))
);
const GradingQueue = lazy(() =>
  import('./features/teacher/GradingQueue').then((m) => ({ default: m.GradingQueue }))
);

// Student features
const StudentDashboard = lazy(() =>
  import('./features/student/StudentDashboard').then((m) => ({ default: m.StudentDashboard }))
);
const StudentQuizList = lazy(() =>
  import('./features/student/StudentQuizList').then((m) => ({ default: m.StudentQuizList }))
);
const StudentQuizDetail = lazy(() =>
  import('./features/student/StudentQuizDetail').then((m) => ({ default: m.StudentQuizDetail }))
);
const StudentAttemptsList = lazy(() =>
  import('./features/student/StudentAttemptsList').then((m) => ({ default: m.StudentAttemptsList }))
);
const StudentQuizResult = lazy(() =>
  import('./features/student/StudentQuizResult').then((m) => ({ default: m.StudentQuizResult }))
);
const StudentQuizResultPrint = lazy(() =>
  import('./features/QuizResultPrint').then((m) => ({ default: m.StudentQuizResultPrint }))
);
const StudentQuizTake = lazy(() =>
  import('./features/student/StudentQuizTake').then((m) => ({ default: m.StudentQuizTake }))
);
const StudentProfileView = lazy(() =>
  import('./features/student/StudentProfileView').then((m) => ({ default: m.StudentProfileView }))
);
const StudentProgressView = lazy(() =>
  import('./features/student/StudentProgressView').then((m) => ({ default: m.StudentProgressView }))
);

interface ComponentStatusItem {
  id: string;
  name: string;
  category: string;
  status: 'Ready' | 'In Review' | 'Planned';
  description: string;
}

const SAMPLE_COMPONENTS: ComponentStatusItem[] = [
  {
    id: 'app-shell',
    name: 'App Shell & Navigation',
    category: 'Layout',
    status: 'Ready',
    description: 'Header, sidebar, theme switcher, and session timer with Django layout parity',
  },
  {
    id: 'data-table',
    name: 'DataTable Primitive',
    category: 'Data Display',
    status: 'Ready',
    description: 'Sortable, searchable, paginated table with accessible markup',
  },
  {
    id: 'modal',
    name: 'Modal Dialog',
    category: 'Overlay',
    status: 'Ready',
    description: 'Accessible modal dialog with ESC key and backdrop handling',
  },
  {
    id: 'form-fields',
    name: 'Form Field Primitives',
    category: 'Forms',
    status: 'Ready',
    description: 'Accessible input fields with validation error feedback',
  },
  {
    id: 'buttons',
    name: 'Button Primitive',
    category: 'Controls',
    status: 'Ready',
    description: 'Multiple variants, sizes, and loading state spinner',
  },
  {
    id: 'error-boundary',
    name: 'Error Boundary & Alert',
    category: 'Feedback',
    status: 'Ready',
    description: 'Graceful runtime error catching and dismissible alert banners',
  },
];

export const ComponentInventoryPreview: FC = () => {
  const { data } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);

  const user = data?.user;
  const school = data?.school;

  const columns: Column<ComponentStatusItem>[] = [
    {
      id: 'name',
      header: 'Component',
      accessor: (row) => (
        <div>
          <span className="core-type--weight-semibold core-text--dark">{row.name}</span>
          <div className="core-type--small core-text--muted">{row.description}</div>
        </div>
      ),
      sortable: true,
    },
    {
      id: 'category',
      header: 'Category',
      accessor: 'category',
      sortable: true,
      width: '140px',
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => (
        <span
          className={`core-badge ${
            row.status === 'Ready'
              ? 'core-surface--success'
              : row.status === 'In Review'
              ? 'core-surface--warning core-text--dark'
              : 'core-surface--secondary'
          }`}
        >
          {row.status}
        </span>
      ),
      sortable: true,
      align: 'center',
      width: '120px',
    },
  ];

  return (
    <div className="react-dashboard-content" data-testid="component-inventory-preview">
      {!alertDismissed && (
        <Alert
          variant="info"
          title="Phase 2 Shared UI Active"
          dismissible
          onDismiss={() => setAlertDismissed(true)}
          className="core-space--margin-bottom-4"
        >
          Visual parity established with Django layout. React-owned style tokens, accent themes,
          and reusable primitives (Table, Modal, Form, Buttons) are now available.
        </Alert>
      )}

      {/* Overview Cards */}
      <div className="core-grid core-grid--gap-3 core-space--margin-bottom-4">
        <div className="core-grid__span-12 core-grid__span-md-4">
          <div className="core-card core-shadow--sm core-border--none core-size--height-full">
            <div className="core-card__body core-space--padding-3">
              <div className="core-display-flex core-layout--align-center core-layout--gap-3">
                <div className="core-space--padding-3 core-surface--primary-subtle core-radius--3 core-text--primary">
                  <AppIcon name="shieldCheck" className="core-type--size-4" />
                </div>
                <div>
                  <div className="core-text--muted core-type--small core-type--weight-semibold">SESSION AUTH</div>
                  <div className="core-type--heading-6 core-space--margin-bottom-0 core-type--weight-bold">{user?.username}</div>
                  <small className="core-text--capitalize core-text--muted">{user?.role}</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="core-grid__span-12 core-grid__span-md-4">
          <div className="core-card core-shadow--sm core-border--none core-size--height-full">
            <div className="core-card__body core-space--padding-3">
              <div className="core-display-flex core-layout--align-center core-layout--gap-3">
                <div className="core-space--padding-3 core-surface--success-subtle core-radius--3 core-text--success">
                  <AppIcon name="building" className="core-type--size-4" />
                </div>
                <div>
                  <div className="core-text--muted core-type--small core-type--weight-semibold">TENANT SCHOOL</div>
                  <div className="core-type--heading-6 core-space--margin-bottom-0 core-type--weight-bold">{school?.name || 'Superadmin Scoped'}</div>
                  <small className="core-text--muted">{school?.code || 'Active'}</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="core-grid__span-12 core-grid__span-md-4">
          <div className="core-card core-shadow--sm core-border--none core-size--height-full">
            <div className="core-card__body core-space--padding-3">
              <div className="core-display-flex core-layout--align-center core-layout--gap-3">
                <div className="core-space--padding-3 core-surface--info-subtle core-radius--3 core-text--info">
                  <AppIcon name="palette" className="core-type--size-4" />
                </div>
                <div>
                  <div className="core-text--muted core-type--small core-type--weight-semibold">ACCENT THEME</div>
                  <div className="core-type--heading-6 core-space--margin-bottom-0 core-type--weight-bold core-text--capitalize">
                    {data?.ui_preferences?.theme || 'Academic Pro'}
                  </div>
                  <small className="core-text--muted">Synced with Django</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Shared Primitives Inventory Table */}
      <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4">
        <div className="core-card__header core-surface--white core-border--bottom core-space--padding-y-3 core-display-flex core-layout--justify-between core-layout--align-center core-layout--wrap core-layout--gap-2">
          <div>
            <h2 className="core-type--heading-6 core-type--weight-bold core-space--margin-bottom-0 core-text--dark">Shared UI Components Inventory</h2>
            <small className="core-text--muted">
              Standard primitives built to match Django appearance and accessibility
            </small>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<AppIcon name="panelsTopLeft" />}
            onClick={() => setIsModalOpen(true)}
          >
            Launch Modal Preview
          </Button>
        </div>
        <div className="core-card__body core-space--padding-3">
          <DataTable
            columns={columns}
            data={SAMPLE_COMPONENTS}
            keyExtractor={(item) => item.id}
            searchPlaceholder="Filter components..."
            defaultPageSize={10}
          />
        </div>
      </div>

      {/* Modal Preview */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Shared Modal Primitive"
        footer={
          <div className="core-display-flex core-layout--justify-end core-layout--gap-2 core-size--width-full">
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              Close
            </Button>
            <Button variant="primary" size="sm" onClick={() => setIsModalOpen(false)}>
              Understood
            </Button>
          </div>
        }
      >
        <p className="core-space--margin-bottom-2">
          This modal primitive uses accessible QuizApp dialog styles. It traps focus,
          responds to the <kbd>Esc</kbd> key, and closes when clicking the backdrop.
        </p>
        <p className="core-space--margin-bottom-0 core-text--muted core-type--small">
          It is ready to be used by Phase 3 (Admin) and Phase 4 (Teacher) forms and confirmation
          workflows.
        </p>
      </Modal>
    </div>
  );
};

const AppShellWithRoutes: FC = () => {
  const { data, loading, error } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="core-display-flex core-size--min-height-vh-100 core-layout--align-center core-layout--justify-center core-surface--light">
        <LoadingSpinner message="Loading authenticated workspace..." size="lg" />
      </div>
    );
  }

  if (error) {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const authHref = `/auth-app/?next=${encodeURIComponent(currentPath)}`;
    if (error.status === 401) {
      return (
        <main className="core-gate">
          <section className="core-gate__panel">
            <p className="core-eyebrow">SESSION SECURITY</p>
            <h1>Session expired</h1>
            <p>Your session is no longer active. Sign in again to continue to the page you requested.</p>
            <a href={authHref} className="core-button">Log in to QuizApp</a>
          </section>
        </main>
      );
    }

    if (error.status === 403) {
      return (
        <main className="core-gate">
          <section className="core-gate__panel">
            <p className="core-eyebrow">ACCESS CONTROL</p>
            <h1>Access restricted</h1>
            <p>{error.message || 'A valid school association is required to access this application.'}</p>
            <a href={authHref} className="core-button">Return to Sign In</a>
          </section>
        </main>
      );
    }
  }

  const role = data?.user?.role;
  const isSuperadmin = role === 'superadmin';
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  const isTakeAssessment = location.pathname.startsWith('/student/take/');
  const isPrintView = location.pathname.endsWith('/print');
  const isStudentArea = location.pathname.startsWith('/student') || (location.pathname === '/' && isStudent);
  const isTeacherArea = location.pathname.startsWith('/teacher') || (location.pathname === '/' && isTeacher);

  const routeContent = (
    <Suspense
        fallback={
          <div className="core-display-flex core-size--min-height-vh-50 core-layout--align-center core-layout--justify-center core-space--padding-y-5">
            <LoadingSpinner message="Loading view..." size="md" />
          </div>
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              isSuperadmin ? (
                <Navigate to="/superadmin/dashboard" replace />
              ) : isTeacher ? (
                <Navigate to="/teacher/dashboard" replace />
              ) : isStudent ? (
                <Navigate to="/student/dashboard" replace />
              ) : (
                <Navigate to="/admin/dashboard" replace />
              )
            }
          />
          {/* Superadmin Routes */}
          <Route
            path="/superadmin/dashboard"
            element={
              <RoleGuard allowedRoles={['superadmin']}>
                <SuperadminDashboard />
              </RoleGuard>
            }
          />
          <Route
            path="/superadmin/schools/new"
            element={
              <RoleGuard allowedRoles={['superadmin']}>
                <SchoolForm />
              </RoleGuard>
            }
          />
          <Route
            path="/superadmin/schools/:schoolId/edit"
            element={
              <RoleGuard allowedRoles={['superadmin']}>
                <SchoolForm />
              </RoleGuard>
            }
          />
          <Route
            path="/superadmin/schools/:schoolId"
            element={
              <RoleGuard allowedRoles={['superadmin']}>
                <SchoolDetail />
              </RoleGuard>
            }
          />
          <Route
            path="/superadmin/schools"
            element={
              <RoleGuard allowedRoles={['superadmin']}>
                <SchoolList />
              </RoleGuard>
            }
          />
          <Route
            path="/superadmin/admins/new"
            element={
              <RoleGuard allowedRoles={['superadmin']}>
                <SuperadminAdminForm />
              </RoleGuard>
            }
          />
          <Route
            path="/superadmin/admins/:adminId/edit"
            element={
              <RoleGuard allowedRoles={['superadmin']}>
                <SuperadminAdminForm />
              </RoleGuard>
            }
          />
          <Route
            path="/superadmin/admins/:adminId"
            element={
              <RoleGuard allowedRoles={['superadmin']}>
                <SuperadminAdminDetail />
              </RoleGuard>
            }
          />
          <Route
            path="/superadmin/admins"
            element={
              <RoleGuard allowedRoles={['superadmin']}>
                <AdminList />
              </RoleGuard>
            }
          />
          <Route
            path="/superadmin/users"
            element={
              <RoleGuard allowedRoles={['superadmin']}>
                <UserList />
              </RoleGuard>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin/students"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <StudentList />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/teachers"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <TeacherList />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <UserList />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <AdminDashboard />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/academic-years"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <AcademicYearsManager />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/terms"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <TermsManager />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/classes"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <ClassesManager />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/classes/:id"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <ClassDetailView />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/subjects"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <SubjectsManager />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/forms"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <StructureManager resource="forms" />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/learning-areas"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <StructureManager resource="learning-areas" />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/departments"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <StructureManager resource="departments" />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/school"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <SchoolSettingsView />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/enrollments"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <StudentEnrollmentsManager />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/assignments"
            element={
              <RoleGuard allowedRoles={['admin', 'superadmin']}>
                <TeacherAssignmentsManager />
              </RoleGuard>
            }
          />

          {/* Teacher Routes */}
          <Route
            path="/teacher/dashboard"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin', 'superadmin']}>
                <TeacherDashboard />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/quizzes"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin', 'superadmin']}>
                <QuizList />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/quizzes/new"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin']}>
                <QuizEditor />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/quizzes/:id"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin', 'superadmin']}>
                <QuizDetail />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/quizzes/:id/edit"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin']}>
                <QuizEditor />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/quizzes/:id/questions/new"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin']}>
                <QuestionEditor />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/quizzes/:id/questions/:questionId/edit"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin']}>
                <QuestionEditor />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/quizzes/:id/questions/import"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin']}>
                <QuestionImport />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/quizzes/:id/assignments"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin']}>
                <QuizAssignments />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/results"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin', 'superadmin']}>
                <QuizResultsList />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/results/print"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin']}>
                <TeacherQuizResultsBulkPrint />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/results/:attemptId"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin']}>
                <QuizResultDetail />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/results/:attemptId/print"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin']}>
                <TeacherQuizResultPrint />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/grading"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin', 'superadmin']}>
                <GradingQueue />
              </RoleGuard>
            }
          />
          <Route
            path="/teacher/grading/:attemptId"
            element={
              <RoleGuard allowedRoles={['teacher', 'admin']}>
                <GradingAttempt />
              </RoleGuard>
            }
          />

          {/* Student Routes */}
          <Route
            path="/student/dashboard"
            element={
              <RoleGuard allowedRoles={['student']}>
                <StudentDashboard />
              </RoleGuard>
            }
          />
          <Route
            path="/student/quizzes"
            element={
              <RoleGuard allowedRoles={['student']}>
                <StudentQuizList />
              </RoleGuard>
            }
          />
          <Route
            path="/student/assignments"
            element={
              <RoleGuard allowedRoles={['student']}>
                <StudentQuizList />
              </RoleGuard>
            }
          />
          <Route
            path="/student/quizzes/:id"
            element={
              <RoleGuard allowedRoles={['student']}>
                <StudentQuizDetail />
              </RoleGuard>
            }
          />
          <Route
            path="/student/attempts"
            element={
              <RoleGuard allowedRoles={['student']}>
                <StudentAttemptsList />
              </RoleGuard>
            }
          />
          <Route
            path="/student/progress"
            element={
              <RoleGuard allowedRoles={['student']}>
                <StudentProgressView />
              </RoleGuard>
            }
          />
          <Route
            path="/student/attempts/:id/result"
            element={
              <RoleGuard allowedRoles={['student']}>
                <StudentQuizResult />
              </RoleGuard>
            }
          />
          <Route
            path="/student/attempts/:id/result/print"
            element={
              <RoleGuard allowedRoles={['student']}>
                <StudentQuizResultPrint />
              </RoleGuard>
            }
          />
          <Route
            path="/student/take/:attemptId"
            element={
              <RoleGuard allowedRoles={['student']}>
                <StudentQuizTake />
              </RoleGuard>
            }
          />
          <Route
            path="/student/profile"
            element={
              <RoleGuard allowedRoles={['student']}>
                <StudentProfileView />
              </RoleGuard>
            }
          />

          {/* 404 Not Found Fallback */}
          <Route
            path="*"
            element={
              <div className="core-container core-space--padding-y-5 core-text--center">
                <h3 className="core-type--heading-4 core-type--weight-bold core-space--margin-bottom-2">Page Not Found</h3>
                <p className="core-text--muted core-space--margin-bottom-4">The requested React route does not exist.</p>
                <a href="/app/" className="core-button core-button--primary core-button--sm">
                  Return to Dashboard
                </a>
              </div>
            }
          />
        </Routes>
      </Suspense>
  );

  if (isTakeAssessment || isPrintView) {
    return routeContent;
  }

  if (isStudentArea) {
    return <StudentAppLayout>{routeContent}</StudentAppLayout>;
  }

  if (isTeacherArea) {
    return <TeacherAppLayout>{routeContent}</TeacherAppLayout>;
  }

  return <AdminAppLayout>{routeContent}</AdminAppLayout>;
};

export const App: FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter basename="/app">
        <AppShellWithRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
