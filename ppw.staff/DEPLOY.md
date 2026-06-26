# Deployment Guide (PM2 & cPanel)

**Method: Single Zip Deployment with PM2**

This guide explains how to deploy using the `ppw_deploy.zip` file, which includes the PM2 configuration.

## Prerequisites
1.  **cPanel Access** (File Manager & Database Wizard).
2.  **SSH Access** (Terminal) to your cPanel account.
3.  **MySQL Database** created.
4.  **`ppw_deploy.zip`** file ready.

---

## 1. Upload & Extract
1.  Go to **cPanel > File Manager**.
2.  Navigate to your domain root (e.g., `public_html`).
3.  **Upload** `ppw_deploy.zip`.
4.  **Extract** it.
    - Result: Frontend files in root, Backend files in `backend/`.

---

## 2. Configure Database
1.  In File Manager, go to the **`backend/`** folder.
2.  Create a **New File** named `.env`.
3.  Paste your database credentials:
    ```env
    DB_HOST=localhost
    DB_PORT=3306
    DB_USERNAME=your_db_user
    DB_PASSWORD=your_db_pass
    DB_NAME=your_db_name
    PORT=3000
    ```
4.  Save the file.

---

## 3. Install & Start (Using Terminal)
1.  Open your **Terminal** (via cPanel or SSH).
2.  Navigate to the backend folder:
    ```bash
    cd public_html/backend
    ```
    *(Adjust path if you extracted elsewhere)*

3.  **Install Dependencies**:
    ```bash
    npm install --production
    ```

4.  **Start w/ PM2**:
    ```bash
    pm2 start ecosystem.config.js
    ```
    *This reads the configuration and starts the app named "ppw-backend".*

5.  **Save Persistence**:
    ```bash
    pm2 save
    ```
    *(Ensures it restarts if the server reboots)*

---

## 4. Verify
1.  Visit `https://ppw.abstechnologies.org.in`.
2.  The App should be live.
3.  If issues arise, check logs or run manually to see the error:
    ```bash
    # Try running manually to see the actual error on screen
    node dist/main.js
    ```
    *Common errors:*
    *   `Connection refused`: Database credentials in `.env` are wrong.
    *   `EADDRINUSE`: Port 3000 is busy. Change `PORT` in `.env` to something like `3001` or `4000`.

    Once fixed, start PM2 again:
    ```bash
    pm2 restart ppw-backend
    ```
