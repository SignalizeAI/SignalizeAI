# Privacy Policy for SignalizeAI

**Last updated:** 6 August 2026

SignalizeAI (“we”, “our”, or “the extension”) is a Chrome and Firefox extension designed to help users analyze publicly available business websites and generate sales-related insights.

We take user privacy seriously. This Privacy Policy explains what data we collect, how it is used, and how it is protected.

## 1. Information We Collect

### 1.1 Website Content

SignalizeAI processes **publicly available content** from:

- The currently active browser tab (single analysis),
- User-submitted URLs in batch mode (CSV upload or pasted URL list), and
- Saved prospects the user has explicitly put under watch (see 1.5)

Processed content may include:

- Page title
- Meta description
- Headings
- Visible text content

This data is used **only to generate on-screen analysis for the user**. To do this, we may inject a content script into the active tab using the browser's `scripting` capability.

We do **not** collect:

- Private pages
- Password-protected content
- User form inputs
- Cookies
- Session data from websites

### 1.2 URL Inputs for Batch Analysis

If a user runs batch analysis, SignalizeAI processes the URL list they provide (via CSV or pasted text) to fetch publicly available website content and generate analyses.

This includes:

- Submitted URLs
- Normalized domains derived from those URLs

### 1.3 User Account Information

If a user chooses to sign in using Google:

- Email address
- Name (as provided by Google)

Authentication is handled securely via **Supabase Authentication**.

### 1.4 Saved Analyses (Optional)

If a user chooses to save analyses:

- Domain name
- Generated analysis results
- Timestamp of save

This data is stored securely in Supabase and is **only accessible to the authenticated user**.

### 1.5 Account Monitoring (Optional)

If a user turns on watching for a saved prospect, the extension re-reads that
company's public website on a schedule so it can tell the user what changed.

- Browser-only watching fetches from the user's own browser and network. Existing
  browser watchers stay in that mode unless the user explicitly enables server
  monitoring for a saved account in the website workspace.
- Opt-in server monitoring fetches the selected company's public homepage and
  linked pricing/careers pages from SignalizeAI servers, including while the
  browser is closed. It does not use user cookies or read authenticated pages.
- Browser-only checks run while the browser is open, and only for domains the user saved
  and explicitly kept under watch. Watching can be turned off per prospect at any
  time, which stops all further checks for that domain.
- Only the pages needed for the comparison are read: the homepage, and, when they
  exist, the company's pricing and careers pages.
- For each check we store a snapshot containing the page title, meta description,
  headings, top-level navigation links, pricing figures, and job titles, plus the
  time of the check. Snapshots are kept per user, are visible only to that user,
  and the oldest are deleted automatically so only a recent window is retained.
- When a change is detected, the before and after text of that change may be sent
  to our AI provider to generate a one-line summary and a suggested opening line,
  under the same terms as section 3.
- A private offering profile can supply services, target customer description,
  work examples and writing preferences for fit suggestions. Bounded profile
  excerpts and change evidence may be processed by our AI provider. Fit is an
  inference; drafts remain editable and nothing is sent automatically.
- Server monitoring retains 12 recent snapshots per account and up to 2,000 inbox
  items per user. Evidence excerpts stay with inbox items when snapshots are
  pruned. Disabling monitoring stops future checks and opportunities, but retains
  existing evidence and drafts. Deleting the saved prospect removes its related
  monitoring data. An already-started fetch may finish after disabling.

## 2. How We Use Data

Collected data is used strictly for:

- Generating AI-based business insights
- Displaying results within the extension
- Running user-requested batch analyses
- Saving user-requested analyses
- Detecting and reporting changes on prospects the user has put under watch
- Improving extension functionality and user experience within the extension

We do **not**:

- Sell user data
- Share data with advertisers
- Track users across websites
- Use data for profiling or marketing

## 3. AI Processing

SignalizeAI uses a third-party AI API to generate insights.

- Only extracted website text is sent for analysis
- No personal user data is sent to the AI service
- API requests are rate-limited and secured server-side
- AI responses are generated on-demand and are not used to train models or retained for unrelated purposes

## 4. Data Storage & Security

- Authentication and saved data are stored using **Supabase**
- API keys are never exposed in the extension
- All backend requests are protected via origin checks and rate limiting
- Industry-standard security practices are followed

## 5. Permissions Explanation

SignalizeAI requests the following permissions:

- **activeTab**: To access the currently active tab when the user runs an analysis
- **tabs**: To identify the active tab and read its URL for analysis context
- **scripting**: To inject the content extraction script into the active tab on demand
- **storage**: To save user settings and preferences
- **alarms**: To schedule background re-checks of the prospects a user has put under watch
- **sidePanel / sidebar_action**: To display analysis results (Chrome uses Side Panel; Firefox uses the sidebar)
- **Host permissions**:
  - `https://*.supabase.co/*` for authentication and storage
  - `https://api.signalizeai.org/*` and `https://dev-api.signalizeai.org/*` for API requests (environment-dependent)
  - `<all_urls>` to allow user-initiated website analysis across arbitrary domains

These permissions are used **only for core functionality**.

## 6. Data Retention & Deletion

- Users may delete saved analyses at any time
- Deleting a saved prospect deletes its stored snapshots and change history
- Turning off watching for a prospect stops all further background checks for it
- Users may sign out to remove access
- Upon account deletion, all user data is removed from our systems

## 7. Third-Party Services

SignalizeAI integrates with:

- Google OAuth (authentication)
- Supabase (authentication & storage)
- AI API provider (text analysis)

Each service operates under its own privacy policy, which governs their respective data handling practices.

## 8. Children’s Privacy

SignalizeAI is not intended for users under the age of 13.
We do not knowingly collect data from children.

## 9. Changes to This Policy

This Privacy Policy may be updated from time to time.
Any changes will be reflected on this page with an updated date.

## 10. Contact

If you have any questions or concerns regarding privacy, you may contact us at:

📧 **[privacy@signalizeai.org](mailto:privacy@signalizeai.org)**

---
