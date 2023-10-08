# Jewellery Store Management System - Electron

This application is designed to manage jewellery stores and store their day-to-day data.
It operates offline and does not require an active internet connection. 
The main repository for running this project utilizes this [submodule](https://github.com/HarshilSharaf/Jewellery-Store-Management-System-Client/) for the client-side code.
The application runs on an Angular frontend and Electron backend.

This application runs on Electron v26.

## Features

- Modern and Easy To Use UI
- Error Logging
- Configurable Database
- Business Analytics Dashboard
- Customer Details Management (Save/Update/Delete)
- Product Management (Save/Update/Delete)
- Order Receipt Download as PDF

## Run Locally

1. Clone the project:

```bash
git clone https://github.com/HarshilSharaf/Jewellery-Store-Management-System-Electron
```
2. Navigate to the project directory:

```bash
cd Jewellery-Store-Management-System-Electron
```

3. Install Project dependencies:

```bash
npm install
```

4. Create the database schema:
   Run all the scripts provided in the following path:
    ```
    https://github.com/HarshilSharaf/Jewellery-Store-Management-System-Electron/tree/main/Scripts
    ```
    To execute all scripts at once, follow these steps:
     - open cmd
     - ```cd Tables``` or ```cd Stored-Procedures\${CHILD_FOLDERS}```
     - ```for %S in (*.sql) do mysql -u USERNAME -pPASSWORD DATABASE < %S``` (Here Password should be entered **without** space after -p )
     - (Here, replace USERNAME, PASSWORD, and DATABASE with your MySQL credentials.)

5. Run the project
  - Start Angular Server
    ```bash
      npm start
    ```
  - Run electron once angular server starts
    ```bash
      npm run electron
    ```    

## Contributing
Contributions are welcome! Please create pull requests for any issues or feature requests.\
This project is still a work in progress.

## References
 - https://www.electronjs.org/docs/latest/api/app
 - https://www.electronjs.org/docs/latest/
