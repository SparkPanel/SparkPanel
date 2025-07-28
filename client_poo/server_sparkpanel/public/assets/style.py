content = '''/* Стили для SparkPanel */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: #f5f5f5;
    color: #333;
    line-height: 1.6;
}

header {
    background-color: #2c3e50;
    color: white;
    padding: 1rem;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

header h1 {
    float: left;
}

nav {
    float: right;
}

nav ul {
    list-style: none;
    display: flex;
}

nav ul li {
    margin-left: 1rem;
}

nav ul li a {
    color: white;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background-color 0.3s;
}

nav ul li a:hover {
    background-color: #34495e;
}

main {
    max-width: 1200px;
    margin: 2rem auto;
    padding: 0 1rem;
}

section {
    background-color: white;
    padding: 2rem;
    margin-bottom: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

h2, h3 {
    margin-bottom: 1rem;
    color: #2c3e50;
}

#add-server {
    background-color: #3498db;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    margin-bottom: 1rem;
}

#add-server:hover {
    background-color: #2980b9;
}

.server-item {
    border: 1px solid #ddd;
    padding: 1rem;
    margin-bottom: 1rem;
    border-radius: 4px;
    background-color: #f9f9f9;
}

.server-item h4 {
    margin-bottom: 0.5rem;
}

.server-actions button {
    background-color: #3498db;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    margin-right: 0.5rem;
}

.server-actions button.stop {
    background-color: #e74c3c;
}

.server-actions button.start {
    background-color: #2ecc71;
}

.server-actions button.delete {
    background-color: #95a5a6;
}

footer {
    text-align: center;
    padding: 2rem;
    background-color: #ecf0f1;
    color: #7f8c8d;
    margin-top: 2rem;
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
}

.stat-card {
    background-color: #ecf0f1;
    padding: 1rem;
    border-radius: 4px;
    text-align: center;
}

.stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #3498db;
}

.log-entry {
    padding: 0.5rem;
    border-bottom: 1px solid #eee;
}

.log-entry.error {
    background-color: #ffeaea;
    color: #e74c3c;
}

.log-entry.warning {
    background-color: #fff9e9;
    color: #f39c12;
}'''