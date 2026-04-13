-- Session Attendance Tracking
-- Coaches mark each player as present / absent / excused per session

CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'excused');

CREATE TABLE IF NOT EXISTS session_attendance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        attendance_status NOT NULL DEFAULT 'present',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, player_id)
);

CREATE INDEX idx_session_attendance_session ON session_attendance(session_id);
CREATE INDEX idx_session_attendance_player  ON session_attendance(player_id);

-- RLS: coach must belong to the session's team
ALTER TABLE session_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage attendance for their sessions"
  ON session_attendance
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN team_coaches tc ON tc.team_id = s.team_id
      WHERE s.id = session_attendance.session_id
        AND tc.coach_id = auth.uid()
    )
  );
