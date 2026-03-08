# Your Step-by-Step Guide
## Building the Jewish–Christian Text Library Website

This guide is written for you as the project owner. It assumes no technical knowledge. It tells you exactly what you need to do, in what order, and what Claude Code will handle for you.

---

## The Big Picture (30-second version)

You have a spreadsheet of 674 ancient texts. You want a website that displays them all. Here is how that happens:

1. You put the spreadsheet into Google Sheets (so it is easy to edit).
2. You set up three free/cheap accounts (GitHub, Vercel, Neon).
3. You give Claude Code the project documents and tell it to build.
4. Claude Code writes all the code, connects everything, and deploys the site.
5. Whenever you update the Google Sheet, the site can be rebuilt to reflect your changes.

That is the whole thing. Below is the detailed version.

---

## PART 1: What You Do (one-time setup)

These are things only you can do because they involve your accounts, your files, and your decisions.

---

### Step 1: Upload the files to Google Drive

You have five files from our conversation:

- **unified_jewish_christian_master_catalogue_v22_cleaned.xlsx** (the cleaned spreadsheet)
- **project_master_brief_v2.md** (master brief for the project)
- **system_architecture_and_build_roadmap_v2.md** (architecture document)
- **spreadsheet_field_definitions_v2.md** (what each spreadsheet column means)
- **database_ingestion_schema_diagram_v2.md** (how data flows through the system)

**What to do:**

1. Download all five files from this conversation.
2. Go to your Google Drive folder: https://drive.google.com/drive/folders/1JuB6UX_tjyavmLutD_PsnNUBVpvZCdfg
3. Create a new subfolder called something like "Jewish-Christian Text Library".
4. Upload all five files into that folder.

---

### Step 2: Turn the spreadsheet into a Google Sheet

The website will read directly from a Google Sheet (not an Excel file), so you need to convert it.

**What to do:**

1. In Google Drive, find the uploaded .xlsx file.
2. Double-click it. It will open in Google Sheets.
3. Go to **File → Save as Google Sheets**.
4. This creates a native Google Sheet. You can delete the .xlsx copy if you like.
5. Open the new Google Sheet and copy the URL from your browser's address bar. You will need this URL later.

That Google Sheet is now your "editorial control panel". Whenever you want to add a text, change a title, fix a classification, or mark something as ready, you edit this sheet.

---

### Step 3: Create a GitHub account

GitHub is where the website's code lives. Think of it as a folder in the cloud that stores the project's code and tracks every change.

**What to do:**

1. Go to https://github.com
2. Sign up for a free account.
3. You do not need to create any repositories (code folders) yourself. Claude Code will do that for you.

---

### Step 4: Create a Vercel account

Vercel is the service that puts your website on the internet. It takes the code from GitHub and turns it into a live website that anyone can visit.

**What to do:**

1. Go to https://vercel.com
2. Sign up using your GitHub account (it will ask to connect them, which is what you want).
3. The free tier is more than enough for this project.
4. You do not need to configure anything yet.

---

### Step 5: Create a Neon account

Neon is the database. It stores all your text data in a structured way so the website can find and display it quickly. Think of it as a very organised filing cabinet that the website reads from.

**What to do:**

1. Go to https://neon.tech
2. Sign up for a free account.
3. Create a new project. Call it something like "jewish-christian-text-library".
4. Neon will show you a "connection string" that looks something like:
   `postgresql://username:password@ep-something.region.aws.neon.tech/dbname`
5. Copy this and save it somewhere safe (a note, a password manager, etc.). Claude Code will need it.

---

### Step 6: Get a Google Sheets API key

This allows the website's importer script to read your Google Sheet automatically (instead of you having to download and upload files manually).

**What to do:**

1. Go to https://console.cloud.google.com
2. Sign in with your Google account.
3. Create a new project (call it whatever you like).
4. In the search bar at the top, search for "Google Sheets API" and enable it.
5. Go to "Credentials" in the left sidebar.
6. Click "Create Credentials" → "Service Account".
7. Give it a name (e.g. "sheet-reader") and click through the steps.
8. Once created, click on the service account, go to the "Keys" tab, and create a new JSON key. A file will download.
9. Save that JSON file somewhere safe. Claude Code will need it.
10. Finally, go to your Google Sheet and share it (using the Share button) with the service account's email address (it looks like something@your-project.iam.gserviceaccount.com). Give it "Viewer" access.

**This is the most fiddly step.** If you get stuck, you can tell Claude Code "help me set up Google Sheets API access" and it will walk you through it in more detail.

---

## PART 2: What Claude Code Does

Once you have completed the steps above, you hand everything over to Claude Code. Here is what it will build for you.

---

### What Claude Code builds

**The website application.** Claude Code will create a complete Next.js website with pages for browsing, reading, and searching all 674 texts. It writes all the code from scratch.

**The database structure.** Claude Code will set up the database tables in your Neon account, defining how texts, metadata, hierarchy, and search data are stored.

**The importer.** Claude Code will write a script that reads your Google Sheet, processes every row, and loads the data into the database. For texts marked as "Ready" with public domain rights, it will also fetch the actual text content from the source URLs and store it.

**The search system.** Claude Code will set up full-text search so visitors can search by title, keyword, tradition, or tier.

**The deployment.** Claude Code will connect your GitHub repository to Vercel so that the website goes live on the internet.

---

### How you talk to Claude Code

Claude Code runs in your terminal (command line). You give it instructions in plain English. Here is roughly what that conversation looks like:

**You say:** "I am building a Jewish and Christian text library website. Here are my project documents [upload the four .md files]. Here is my Google Sheet URL. Here is my Neon database connection string. Here is my Google Sheets API credentials. Please start building Phase 1."

**Claude Code then:**
- Creates the project folder and all the code files
- Sets up the database schema
- Builds the importer script
- Builds the website pages
- Tests everything locally
- Helps you deploy to Vercel

You can watch it work and it will ask you questions if it needs decisions from you.

---

## PART 3: The Build Phases

The project is built in stages. You do not need to do everything at once.

---

### Phase 1: Foundation (get the skeleton working)

**What happens:** Claude Code creates the project, database, and basic pages. Every one of your 674 texts gets a page, even if it only shows metadata.

**What you see:** A working website (probably at something like your-project.vercel.app) where you can browse all 674 texts. Most pages will just show the title, tradition, tier, and a note saying "full text coming soon".

**Your role:** Check the site, make sure titles look right, hierarchy makes sense, no pages are missing.

---

### Phase 2: Content (get the actual texts in)

**What happens:** Claude Code runs the importer to fetch the full text for the 125 "Ready" rows. These are the texts with confirmed public domain sources. It cleans up the HTML and stores it.

**What you see:** 125 texts now display their full content. The rest still show metadata placeholders.

**Your role:** Read through some of the ingested texts. Check they look right. If you find issues, note them. Over time, you can update more rows in the Google Sheet from "Needs Review" to "Ready" as you verify sources, and re-run the importer to bring in more texts.

---

### Phase 3: Search and polish

**What happens:** Claude Code adds a search bar, filtering by tradition/tier/genre, and improves the visual design.

**What you see:** Visitors can now search for "Gospel of Thomas" or "Mishnah" and find what they need. The site starts to feel like a real library.

**Your role:** Test the search. Suggest design improvements. Decide on the home page content.

---

### Phase 4: Scholarly features (later)

**What happens:** Claude Code adds passage-level navigation (e.g. Genesis 1:3), cross-references between texts, and other research tools.

**What you see:** A research-grade digital corpus.

**Your role:** Decide which citation formats matter most, review the results.

---

## PART 4: Ongoing Maintenance

Once the site is live, here is your regular workflow.

---

### Adding or changing a text

1. Open the Google Sheet in your browser.
2. Add a new row, or edit an existing one (change the title, fix a URL, change the ingest readiness status, etc.).
3. Tell Claude Code to re-run the importer (or eventually this will happen automatically).
4. The site rebuilds and your changes appear.

That is it. You never touch code. You just edit the spreadsheet.

---

### What costs money?

- **GitHub**: free
- **Vercel**: free tier handles this easily (static sites are very cheap)
- **Neon**: free tier includes 0.5 GB storage, which is plenty for 674 texts
- **Google Sheets API**: free
- **Claude Code**: requires an Anthropic subscription or API access

Total likely cost at launch: effectively nothing beyond your Claude subscription.

---

## PART 5: Quick Reference

### Accounts you need

| Service | What it does | URL | Cost |
|---|---|---|---|
| GitHub | Stores the code | github.com | Free |
| Vercel | Hosts the website | vercel.com | Free |
| Neon | Hosts the database | neon.tech | Free |
| Google Cloud | Sheets API access | console.cloud.google.com | Free |

### Things Claude Code needs from you

| Item | Where to get it |
|---|---|
| Google Sheet URL | Your browser bar when viewing the sheet |
| Neon connection string | Neon dashboard, under your project |
| Google Sheets API JSON key | Google Cloud Console, under Credentials |
| The four .md project documents | Downloaded from this conversation |

### Your ongoing tools

| Task | Where you do it |
|---|---|
| Add/edit texts | Google Sheet |
| Check the website | Your Vercel URL |
| Request changes to the site | Claude Code |

---

## Summary

You handle the editorial side (the Google Sheet). Claude Code handles all the technical side (the code, the database, the deployment). You never need to write code, use a terminal, or understand programming. Your job is to curate the corpus and make decisions. Claude Code's job is to turn your spreadsheet into a working website.
