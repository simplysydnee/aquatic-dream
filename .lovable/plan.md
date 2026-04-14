

## Rename "Bubble Makers" → "Little Fins"

### Why
The name "Bubble Makers" is trademarked by PADI and needs to be replaced with "Little Fins" for the white preschool level.

### Changes

**3 code files** — replace all instances of "Bubble Makers" with "Little Fins":

1. **`src/pages/SwimLessons.tsx`** (line 13) — curriculum card `group` value
2. **`src/components/swim-enrollment/types.ts`** (lines 14, 24) — `LEVEL_DISPLAY` groupName and `getGroupName` return value
3. **`src/pages/admin/SessionsAdmin.tsx`** (line 68) — `LEVEL_TO_GROUP` mapping

**Database** — update 16 rows in `swim_sessions`:
```sql
UPDATE swim_sessions SET session_name = 'Little Fins'
WHERE session_name = 'Bubble Makers';
```

Historical migration files will not be edited.

### Steps
1. Update all three code files
2. Run the data update on `swim_sessions`

