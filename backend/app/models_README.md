# Data model

Initial relational entities for MotionForge:

- `User`: Google identity subject and basic profile (no Google access token stored here).
- `Project`: belongs to one user.
- `ConversationMessage`: belongs to one project and stores the chat history.

Project and message API endpoints will be added only after Google identity verification and ownership checks are implemented. Do not expose these tables through unauthenticated routes.
