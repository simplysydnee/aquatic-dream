## Fix: rename `auto_charge_*` → `charge_*` in 5 remaining edge functions

DB columns were renamed to `charge_status`, `charge_attempted_at`, `charge_error`. These 5 edge functions still reference the old names and break at runtime (public booking shows "Could not find the 'auto_charge_status' column").

### Files (verified via ripgrep)

1. `supabase/functions/create-private-booking-setup/index.ts`
2. `supabase/functions/admin-setup-card-for-booking/index.ts`
3. `supabase/functions/cancel-private-lesson-occurrence/index.ts`
4. `supabase/functions/admin-manage-private-booking/index.ts`
5. `supabase/functions/charge-private-lesson-occurrence/index.ts`

### Rename (applied everywhere — column names, filters, property access, comments)

- `auto_charge_status` → `charge_status`
- `auto_charge_attempted_at` → `charge_attempted_at`
- `auto_charge_error` → `charge_error`

Pure rename. No logic changes. No DB migrations. No other files touched.

### Redeploy

All 5 functions via `supabase--deploy_edge_functions`.

> Please click **Implement plan** to approve — that's what flips me to build mode so I can run the rename and redeploy.
