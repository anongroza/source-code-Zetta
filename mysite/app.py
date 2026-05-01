from flask import Flask, request, jsonify, send_from_directory, render_template
import sqlite3
from datetime import datetime, timedelta
import html
import os
import secrets
import hashlib
import sys
import re
from collections import defaultdict
import os
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024
app.secret_key = os.getenv('SECRET_KEY', secrets.token_hex(32))

@app.after_request
def hide_headers(response):
    response.headers['Server'] = 'Unknown'
    response.headers['X-Powered-By'] = ''
    return response

ON_PYTHONANYWHERE = 'pythonanywhere' in sys.executable or 'PYTHONANYWHERE_DOMAIN' in os.environ
if ON_PYTHONANYWHERE:
    BASE_DIR = '/home/groza123'
    DB_PATH = os.path.join(BASE_DIR, 'chat.db')
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
else:
    DB_PATH = 'chat.db'
    UPLOAD_FOLDER = 'uploads'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}

login_attempts = defaultdict(list)

def check_login_limit(ip):
    now = datetime.now()
    login_attempts[ip] = [t for t in login_attempts[ip] if now - t < timedelta(minutes=15)]
    if len(login_attempts[ip]) >= 5:
        return False
    login_attempts[ip].append(now)
    return True

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY, login TEXT UNIQUE, password TEXT, display_name TEXT, avatar_emoji TEXT DEFAULT '👤', secret_phrase TEXT, public_key TEXT, is_online INTEGER DEFAULT 0, last_seen TEXT, created_at TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER, created_at TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS dialogs (id INTEGER PRIMARY KEY, user1_id INTEGER, user2_id INTEGER, last_message TEXT, last_message_time TEXT, UNIQUE(user1_id, user2_id))''')
    c.execute('''CREATE TABLE IF NOT EXISTS dialog_messages (id INTEGER PRIMARY KEY, dialog_id INTEGER, from_user_id INTEGER, text TEXT, image TEXT, timestamp TEXT, read INTEGER DEFAULT 0)''')
    # Миграция для старых таблиц
    c.execute("PRAGMA table_info(users)")
    cols = [col[1] for col in c.fetchall()]
    if 'public_key' not in cols:
        c.execute("ALTER TABLE users ADD COLUMN public_key TEXT")
    if 'secret_phrase' not in cols:
        c.execute("ALTER TABLE users ADD COLUMN secret_phrase TEXT")
    conn.commit()
    conn.close()

init_db()

def hash_password(password):
    salt = secrets.token_hex(16)
    return salt + hashlib.sha256((password + salt).encode()).hexdigest()

def verify_password(password, hashed):
    salt = hashed[:32]
    return hashed == salt + hashlib.sha256((password + salt).encode()).hexdigest()

def hash_secret(secret):
    salt = secrets.token_hex(16)
    return salt + hashlib.sha256((secret + salt).encode()).hexdigest()

def verify_secret(secret, hashed):
    salt = hashed[:32]
    return hashed == salt + hashlib.sha256((secret + salt).encode()).hexdigest()

def validate_password_strength(password):
    if len(password) < 5:
        return False, "Пароль должен содержать минимум 5 символов"
    if not re.search(r'\d', password):
        return False, "Пароль должен содержать хотя бы одну цифру"
    return True, ""

def sanitize_input(text, max_length=500):
    if not text:
        return ''
    text = text.strip()[:max_length]
    return html.escape(text)

def is_safe_filename(filename):
    if '..' in filename or filename.startswith('/') or filename.startswith('\\') or '~' in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return False
    return True

def get_user_by_token(token):
    if not token:
        return None
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT user_id FROM sessions WHERE token = ?", (token,))
    row = c.fetchone()
    conn.close()
    return row[0] if row else None

def check_dialog_access(user_id, dialog_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT user1_id, user2_id FROM dialogs WHERE id = ?", (dialog_id,))
    d = c.fetchone()
    conn.close()
    return d and (user_id in (d[0], d[1]))

def get_or_create_dialog(user1_id, user2_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    u1, u2 = sorted([user1_id, user2_id])
    c.execute("SELECT id FROM dialogs WHERE user1_id = ? AND user2_id = ?", (u1, u2))
    row = c.fetchone()
    if row:
        dialog_id = row[0]
    else:
        c.execute("INSERT INTO dialogs (user1_id, user2_id, last_message, last_message_time) VALUES (?, ?, ?, ?)",
                  (u1, u2, '', ''))
        dialog_id = c.lastrowid
        conn.commit()
    conn.close()
    return dialog_id

def update_user_online(user_id, is_online):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE users SET is_online = ?, last_seen = ? WHERE id = ?",
              (1 if is_online else 0, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), user_id))
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    login = sanitize_input(data.get('login'), 50)
    password = data.get('password')
    secret_phrase = data.get('secret_phrase')
    display_name = sanitize_input(data.get('display_name'), 50)
    avatar_emoji = sanitize_input(data.get('avatar_emoji'), 2)
    if not login or not password or not display_name or not secret_phrase:
        return jsonify({'error': 'Заполните все поля'}), 400
    valid, msg = validate_password_strength(password)
    if not valid:
        return jsonify({'error': msg}), 400
    if not avatar_emoji:
        avatar_emoji = '👤'
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    if c.execute("SELECT id FROM users WHERE login = ?", (login,)).fetchone():
        conn.close()
        return jsonify({'error': 'Логин уже существует'}), 400
    hashed_password = hash_password(password)
    hashed_secret = hash_secret(secret_phrase)
    c.execute("INSERT INTO users (login, password, display_name, avatar_emoji, secret_phrase, created_at) VALUES (?,?,?,?,?,?)",
              (login, hashed_password, display_name, avatar_emoji, hashed_secret, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})

@app.route('/login', methods=['POST'])
def login():
    ip = request.remote_addr
    if not check_login_limit(ip):
        return jsonify({'error': 'Слишком много попыток. Подождите 15 минут.'}), 429
    data = request.json
    login = sanitize_input(data.get('login'), 50)
    password = data.get('password')
    secret_phrase = data.get('secret_phrase')
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    user = c.execute("SELECT id, password, secret_phrase, display_name FROM users WHERE login = ?", (login,)).fetchone()
    if user and verify_password(password, user[1]) and verify_secret(secret_phrase, user[2]):
        token = secrets.token_hex(32)
        c.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
                  (token, user[0], datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        conn.commit()
        conn.close()
        return jsonify({'token': token, 'display_name': user[3], 'user_id': user[0]})
    conn.close()
    return jsonify({'error': 'Неверный логин, пароль или кодовая фраза'}), 401

@app.route('/save_public_key', methods=['POST'])
def save_public_key():
    data = request.json
    token = data.get('token')
    public_key = data.get('public_key')
    user_id = get_user_by_token(token)
    if not user_id or not public_key:
        return jsonify({'error': 'Unauthorized'}), 401
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE users SET public_key = ? WHERE id = ?", (public_key, user_id))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})

@app.route('/get_public_key', methods=['GET'])
def get_public_key():
    token = request.args.get('token')
    target_user_id = request.args.get('user_id', type=int)
    user_id = get_user_by_token(token)
    if not user_id or not target_user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT public_key FROM users WHERE id = ?", (target_user_id,))
    row = c.fetchone()
    conn.close()
    if row and row[0]:
        return jsonify({'public_key': row[0]})
    return jsonify({'public_key': None}), 404

@app.route('/logout', methods=['POST'])
def logout():
    data = request.json
    token = data.get('token')
    user_id = get_user_by_token(token)
    if user_id:
        update_user_online(user_id, False)
    return jsonify({'status': 'ok'})

@app.route('/update_online', methods=['POST'])
def update_online():
    data = request.json
    token = data.get('token')
    user_id = get_user_by_token(token)
    if user_id:
        update_user_online(user_id, True)
    return jsonify({'status': 'ok'})

@app.route('/user_online_status', methods=['GET'])
def user_online_status():
    token = request.args.get('token')
    target_id = request.args.get('user_id', type=int)
    user_id = get_user_by_token(token)
    if not user_id or not target_id:
        return jsonify({'is_online': False}), 401
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT is_online FROM users WHERE id = ?", (target_id,))
    row = c.fetchone()
    conn.close()
    return jsonify({'is_online': bool(row and row[0])})

@app.route('/search_users_to_add', methods=['GET'])
def search_users_to_add():
    token = request.args.get('token')
    q = sanitize_input(request.args.get('q', ''), 50)
    user_id = get_user_by_token(token)
    if not user_id:
        return jsonify([]), 401
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    users = c.execute("SELECT id, login, display_name, avatar_emoji FROM users WHERE login LIKE ? AND id != ? LIMIT 20",
                      (f'%{q}%', user_id)).fetchall()
    conn.close()
    return jsonify([{'id': u[0], 'login': u[1], 'display_name': u[2], 'avatar_emoji': u[3]} for u in users])

@app.route('/create_dialog', methods=['POST'])
def create_dialog():
    data = request.json
    token = data.get('token')
    companion_id = data.get('companion_id')
    user_id = get_user_by_token(token)
    if not user_id or not companion_id:
        return jsonify({'error': 'Unauthorized'}), 401
    dialog_id = get_or_create_dialog(user_id, companion_id)
    return jsonify({'dialog_id': dialog_id})

@app.route('/delete_dialog', methods=['POST'])
def delete_dialog():
    data = request.json
    token = data.get('token')
    dialog_id = data.get('dialog_id')
    user_id = get_user_by_token(token)
    if not user_id or not dialog_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not check_dialog_access(user_id, dialog_id):
        return jsonify({'error': 'Forbidden'}), 403
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM dialog_messages WHERE dialog_id = ?", (dialog_id,))
    c.execute("DELETE FROM dialogs WHERE id = ?", (dialog_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})

@app.route('/get_dialogs', methods=['GET'])
def get_dialogs():
    token = request.args.get('token')
    user_id = get_user_by_token(token)
    if not user_id:
        return jsonify([]), 401
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    dialogs = c.execute('''
        SELECT d.id, 
               CASE WHEN d.user1_id = ? THEN d.user2_id ELSE d.user1_id END as companion_id,
               u.display_name, u.avatar_emoji, u.is_online,
               d.last_message, d.last_message_time,
               (SELECT COUNT(*) FROM dialog_messages WHERE dialog_id = d.id AND from_user_id != ? AND read = 0) as unread
        FROM dialogs d
        JOIN users u ON u.id = CASE WHEN d.user1_id = ? THEN d.user2_id ELSE d.user1_id END
        WHERE d.user1_id = ? OR d.user2_id = ?
        ORDER BY d.last_message_time DESC
    ''', (user_id, user_id, user_id, user_id, user_id)).fetchall()
    conn.close()
    result = []
    for d in dialogs:
        result.append({
            'dialog_id': d[0],
            'companion_id': d[1],
            'companion_name': d[2],
            'companion_emoji': d[3] or '👤',
            'companion_online': bool(d[4]),
            'last_message': d[5],
            'last_message_time': d[6],
            'unread_count': d[7]
        })
    return jsonify(result)

@app.route('/send_dialog_message', methods=['POST'])
def send_dialog_message():
    data = request.json
    token = data.get('token')
    dialog_id = data.get('dialog_id')
    text = data.get('text', '')
    user_id = get_user_by_token(token)
    if not user_id or not dialog_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not check_dialog_access(user_id, dialog_id):
        return jsonify({'error': 'Forbidden'}), 403
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    timestamp = datetime.now().strftime("%H:%M:%S")
    c.execute("INSERT INTO dialog_messages (dialog_id, from_user_id, text, timestamp, read) VALUES (?,?,?,?,?)",
              (dialog_id, user_id, text, timestamp, 0))
    message_id = c.lastrowid
    c.execute("UPDATE dialogs SET last_message = ?, last_message_time = ? WHERE id = ?",
              (text[:100], timestamp, dialog_id))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok', 'id': message_id})

@app.route('/upload_encrypted_image', methods=['POST'])
def upload_encrypted_image():
    data = request.json
    token = data.get('token')
    dialog_id = data.get('dialog_id')
    encrypted_image = data.get('encrypted_image')
    user_id = get_user_by_token(token)
    if not user_id or not dialog_id or not encrypted_image:
        return jsonify({'error': 'Unauthorized'}), 401
    if not check_dialog_access(user_id, dialog_id):
        return jsonify({'error': 'Forbidden'}), 403
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    timestamp = datetime.now().strftime("%H:%M:%S")
    c.execute("INSERT INTO dialog_messages (dialog_id, from_user_id, image, timestamp, read) VALUES (?,?,?,?,?)",
              (dialog_id, user_id, encrypted_image, timestamp, 0))
    message_id = c.lastrowid
    c.execute("UPDATE dialogs SET last_message = ?, last_message_time = ? WHERE id = ?",
              ('📷 Фото', timestamp, dialog_id))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok', 'id': message_id})

@app.route('/get_dialog_messages', methods=['GET'])
def get_dialog_messages():
    token = request.args.get('token')
    dialog_id = request.args.get('dialog_id', type=int)
    user_id = get_user_by_token(token)
    if not user_id or not dialog_id:
        return jsonify([]), 401
    if not check_dialog_access(user_id, dialog_id):
        return jsonify([]), 403
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE dialog_messages SET read = 1 WHERE dialog_id = ? AND from_user_id != ? AND read = 0",
              (dialog_id, user_id))
    rows = c.execute('SELECT id, from_user_id, text, image, timestamp FROM dialog_messages WHERE dialog_id = ? ORDER BY id ASC', (dialog_id,)).fetchall()
    conn.commit()
    conn.close()
    return jsonify([{'id': r[0], 'from_user_id': r[1], 'text': r[2], 'image': r[3], 'timestamp': r[4]} for r in rows])

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    if not is_safe_filename(filename):
        return jsonify({'error': 'Forbidden'}), 403
    return send_from_directory(UPLOAD_FOLDER, filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)