#!/usr/bin/env bash
# Starts a throwaway PostgreSQL 16 cluster used by `npm run test:db` to validate the
# migrations and RLS policies without a Supabase project. Data lives in ./.pgdata.
#
#   npm run db:local          # start (idempotent)
#   npm run db:local -- stop  # stop
set -euo pipefail

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PRUMO_TEST_DB_PORT:-54329}"
DATA_DIR="$(pwd)/.pgdata"
RUN_AS=()

if [[ -z "${PGBIN}" || ! -x "${PGBIN}/pg_ctl" ]]; then
  echo "PostgreSQL server binaries not found. Install postgresql or set PGBIN." >&2
  exit 1
fi

# initdb refuses to run as root.
if [[ "$(id -u)" == "0" ]]; then
  id postgres >/dev/null 2>&1 || useradd --system --no-create-home postgres
  RUN_AS=(runuser -u postgres --)
fi

if [[ "${1:-start}" == "stop" ]]; then
  "${RUN_AS[@]}" "${PGBIN}/pg_ctl" -D "${DATA_DIR}" stop -m fast || true
  exit 0
fi

if [[ ! -f "${DATA_DIR}/PG_VERSION" ]]; then
  mkdir -p "${DATA_DIR}"
  [[ ${#RUN_AS[@]} -gt 0 ]] && chown postgres "${DATA_DIR}"
  "${RUN_AS[@]}" "${PGBIN}/initdb" -D "${DATA_DIR}" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
fi

if ! "${RUN_AS[@]}" "${PGBIN}/pg_ctl" -D "${DATA_DIR}" status >/dev/null 2>&1; then
  "${RUN_AS[@]}" "${PGBIN}/pg_ctl" -D "${DATA_DIR}" -o "-p ${PORT} -k /tmp -c listen_addresses=127.0.0.1" -l "${DATA_DIR}/server.log" start >/dev/null
fi

echo "PostgreSQL running on 127.0.0.1:${PORT} (user postgres, no password)"
