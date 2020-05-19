import sqlite3
from sqlite3 import Error
from flask import Flask, g, abort, request, jsonify
import os
import json
from datetime import datetime

app = Flask("recipe view", static_folder="../dist", static_url_path="/static")
DATABASE = "database.sqlite"


@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/<int:id>')
def session(id: int):
    return index()


@app.route('/data/moulds')
def data_moulds():
    return app.send_static_file('moulds.json')


def initialize_database(conn):
    c = conn.cursor()
    c.execute("""
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    created_date TEXT NOT NULL,
    name TEXT NOT NULL,
    last_edited TEXT
);
""")

    c.execute("""
CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY,
    session INTEGER NOT NULL,
    name TEXT NOT NULL,
    last_edited TEXT,
    data BLOB
);
""")


def create_connection(db_file):
    """ create a database connection to a SQLite database """
    conn = sqlite3.connect(db_file)
    print(sqlite3.version)
    return conn


def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
    return db


@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


@app.route('/data/recipes', methods=["GET"])
def recipe_list():
    c = get_db().cursor()
    c.execute("SELECT id, name, last_edited from recipes")
    return jsonify({
        "status": "ok",
        "data": [{"id": v[0], "name": v[1], "last_edited": v[2]} for v in c.fetchall()]
    })


def recipe_view(id: int):
    c = get_db().cursor()
    c.execute("SELECT id, name, last_edited, session, data from recipes where id=?", (id,))
    res = c.fetchone()
    if res is None:
        abort(404)

    try:
        jsondata = json.loads(res[4])
        jsondata["id"] = res[0]
        jsondata["last_edited"] = res[2]
    except:
        print("Could not deserialize json data in database\n", res[2])
        abort(500)

    return jsondata


@app.route('/data/recipes/<int:id>', methods=["GET"])
def recipe_view_json(id: int):
    return jsonify({
        "status": "ok",
        "data": recipe_view(id)
    })


@app.route('/data/recipes', methods=["POST"])
def recipe_create():
    conn = get_db()
    c = conn.cursor()

    req_data = request.get_json()
    try:
        name = req_data["name"]
        session = req_data["session"]
        assert isinstance(session, int)
    except:
        abort(400)

    c.execute("INSERT INTO recipes (name, last_edited, session, data) VALUES(?,?,?,?)",
              (name, datetime.now(), session, json.dumps(req_data)))
    conn.commit()
    return recipe_view(c.lastrowid)


@app.route('/data/recipes/<int:id>', methods=["UPDATE"])
def recipe_update(id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id from recipes where id=?", (id,))
    res = c.fetchone()
    if res is None:
        abort(404)

    req_data = request.get_json()
    try:
        name = req_data["name"]
    except:
        abort(400)

    c.execute("UPDATE recipes SET name=?, last_edited=?, data=? where id=?",
              (name, datetime.now(), json.dumps(req_data), id))
    conn.commit()
    return recipe_view(id)


@app.route('/data/recipes/<int:id>', methods=["DELETE"])
def recipe_delete(id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id from recipes where id=?", (id,))
    res = c.fetchone()
    if res is None:
        abort(404)

    c.execute("DELETE FROM recipes where id=?", (id,))
    conn.commit()
    return jsonify({
        "status": "ok",
    })


@app.route('/data/sessions', methods=["GET"])
def session_list():
    c = get_db().cursor()
    c.execute("SELECT id, name, created_date, last_edited from sessions")
    res = c.fetchall()

    return jsonify({
        "status": "ok",
        "data": [{
            "id": x[0],
            "name": x[1],
            "created_date": x[2],
            "last_edited": x[3],
        } for x in res]
    })


@app.route('/data/sessions/deep', methods=["GET"])
def session_list_deep():
    c = get_db().cursor()
    c.execute("SELECT id, name, created_date, last_edited from sessions")
    res = c.fetchall()

    return jsonify({
        "status": "ok",
        "data": [session_view_deep(x[0]) for x in res]
    })


def session_view_deep(id: int):
    c = get_db().cursor()
    c.execute("SELECT id, name, created_date, last_edited from sessions where id=?", (id,))
    res = c.fetchone()
    if res is None:
        abort(404)

    c.execute("SELECT id from recipes where session=?", (id,))
    recipes = c.fetchall()

    return {
        "id": res[0],
        "name": res[1],
        "created_date": res[2],
        "last_edited": res[3],
        "recipes": [recipe_view(x[0]) for x in recipes],
    }


def session_view(id: int):
    c = get_db().cursor()
    c.execute("SELECT id, name, created_date, last_edited from sessions where id=?", (id,))
    res = c.fetchone()
    if res is None:
        abort(404)

    c.execute("SELECT id from recipes where session=?", (id,))
    recipes = c.fetchall()

    return {
        "id": res[0],
        "name": res[1],
        "created_date": res[2],
        "last_edited": res[3],
        "recipes": [x[0] for x in recipes],
    }


@app.route('/data/sessions/<int:id>', methods=["GET"])
def session_view_json(id: int):
    return jsonify({
        "status": "ok",
        "data": session_view(id)
    })


@app.route('/data/sessions', methods=["POST"])
def session_create():
    conn = get_db()
    c = conn.cursor()

    req_data = request.get_json()
    try:
        name = req_data["name"]
    except:
        abort(400)

    now = datetime.now()
    c.execute("INSERT INTO sessions (name, created_date, last_edited) VALUES(?,?,?)", (name, now, now))
    conn.commit()
    return session_view(c.lastrowid)


if __name__ == '__main__':
    with app.app_context():
        initialize_database(get_db())

    app.run(debug=True)
