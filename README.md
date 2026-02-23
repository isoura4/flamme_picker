# 🔥 Flamme Picker

A kiosk-style web application for ordering flammekueche (tarte flambée). Customers can browse available options and place orders from a simple interface, while an admin panel lets you manage the menu, track orders, and curate a photo memories gallery.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Running the App](#running-the-app)
- [Environment Variables](#environment-variables)
- [Using the App](#using-the-app)
  - [Ordering a Flammekueche](#ordering-a-flammekueche)
  - [Memories Gallery](#memories-gallery)
- [Admin Panel](#admin-panel)
  - [Logging In](#logging-in)
  - [Managing Orders](#managing-orders)
  - [Managing the Menu](#managing-the-menu)
  - [Managing Memories](#managing-memories)
- [Project Structure](#project-structure)

---

## Requirements

- [Node.js](https://nodejs.org/) v20 or later
- npm (included with Node.js)

---

## Installation

```bash
git clone https://github.com/isoura4/flamme_picker.git
cd flamme_picker
npm install
```

---

## Running the App

```bash
npm start
```

The server starts on **http://localhost:3000** by default.

To use a different port, set the `PORT` environment variable:

```bash
PORT=8080 npm start
```

---

## Environment Variables

| Variable         | Default     | Description                                      |
|------------------|-------------|--------------------------------------------------|
| `PORT`           | `3000`      | Port the server listens on                       |
| `ADMIN_PASSWORD` | `admin123`  | Password for the admin panel (**change in production**) |

Example:

```bash
ADMIN_PASSWORD=mysecretpassword PORT=4000 npm start
```

> ⚠️ Always set a strong `ADMIN_PASSWORD` in production. The app will print a warning if the default password is used.

---

## Using the App

### Ordering a Flammekueche

1. Open **http://localhost:3000** in a browser.
2. A grid of available flammekueche options is displayed, each with a name, description, and colour.
3. Click on the flammekueche you want to order.
4. Enter your first name in the form that appears.
5. Click **Commander 🔥** to confirm your order.
6. A success message confirms the order has been placed.

### Memories Gallery

Navigate to **http://localhost:3000/memories.html** to browse photos from previous editions.

- Use the year tabs at the top to filter photos by year.
- Click any photo to open it in a lightbox view.

---

## Admin Panel

Access the admin panel at **http://localhost:3000/admin.html**.

### Logging In

Enter the admin password (set via `ADMIN_PASSWORD`, default: `admin123`) and click **Se connecter**.

### Managing Orders

The **Commandes** tab shows all orders in reverse chronological order, along with summary statistics.

- **↻ Rafraîchir** – reload the order list.
- **Préparée** checkbox – mark an order as prepared.
- **Envoyée** checkbox – mark an order as sent/delivered.
- **🗑** button – delete an order permanently.

### Managing the Menu

The **Flammekueches** tab lets you manage the available options displayed to customers.

**Add a flammekueche:**
1. Fill in the **Nom** (name) and choose a **Couleur** (colour).
2. Optionally add a **Description** and an **image URL** (external URL or a path like `/images/nom.jpg`).
3. Click **+ Ajouter**.

**Edit or remove a flammekueche:**
- Each card in the grid has an edit ✏️ button to update its details.
- Toggle the availability switch to show or hide it from customers without deleting it.
- Click the 🗑 button to permanently delete it.

### Managing Memories

The **Memories** tab lets you upload and manage photos shown in the public gallery.

**Upload a photo:**
1. Enter the **Année** (year) the photo is from.
2. Optionally add a **Légende** (caption).
3. Choose an image file (JPEG, PNG, etc., max 10 MB).
4. Click **📤 Téléverser**.

**Delete a photo:**
- Click the 🗑 button on any photo card. The image file is also removed from the server.

---

## Project Structure

```
flamme_picker/
├── server.js          # Express server and API routes
├── package.json
├── data/
│   └── db.json        # JSON database (auto-created on first run)
└── public/
    ├── index.html     # Customer ordering page
    ├── admin.html     # Admin panel
    ├── memories.html  # Public memories gallery
    ├── css/
    │   └── style.css
    ├── images/        # Default flammekueche images
    ├── js/
    │   ├── order.js
    │   ├── admin.js
    │   └── memories.js
    └── uploads/       # Uploaded memory photos (auto-created)
```