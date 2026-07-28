In src/pages/JoinMembership.tsx, remove the hardcoded test-mode helper text shown directly under the "Continue to secure payment" button in step 6 (the Review step).

Current text to remove:
```tsx
<p className="mt-2 text-center text-xs text-[#2a5e84]">
  Test mode — use card 4242 4242 4242 4242 with any future expiry & CVC.
</p>
```

No replacement text. No other changes to copy, checkout flow, or quote logic.
