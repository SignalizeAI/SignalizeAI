# Privacy Policy for SignalizeAI

**Last updated:** 27 February 2026

SignalizeAI (“we”, “our”, or “the extension”) is a Chrome and Firefox extension designed to help users analyze publicly available business websites and generate sales-related insights.

We take user privacy seriously. This Privacy Policy explains what data we collect, how it is used, and how it is protected.

## 1. Information We Collect

### 1.1 Website Content

SignalizeAI processes **publicly available content** from the currently active browser tab, including:

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

### 1.2 User Account Information

If a user chooses to sign in using Google:

- Email address
- Name (as provided by Google)

Authentication is handled securely via **Supabase Authentication**.

### 1.3 Saved Analyses (Optional)

If a user chooses to save analyses:

- Domain name
- Generated analysis results
- Timestamp of save

This data is stored securely in Supabase and is **only accessible to the authenticated user**.

## 2. How We Use Data

Collected data is used strictly for:

- Generating AI-based business insights
- Displaying results within the extension
- Saving user-requested analyses
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
- **sidePanel / sidebar_action**: To display analysis results (Chrome uses Side Panel; Firefox uses the sidebar)
- **Host permissions**: `https://*.supabase.co/*` and `https://api.signalizeai.org/*` for authentication and API requests

These permissions are used **only for core functionality**.

## 6. Data Retention & Deletion

- Users may delete saved analyses at any time
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
