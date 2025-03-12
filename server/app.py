from flask import Flask, request, jsonify, render_template, redirect, url_for
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json
import os
import pymysql

app = Flask(__name__)
CORS(app) # Permite que qualquer origem acesse a API

# Change the database configuration to use MySQL
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:password@localhost:3306/transparency_db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Database models - Define models BEFORE creating tables
class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100))
    session_id = db.Column(db.String(100))
    seco_portal = db.Column(db.String(500))
    user_agent = db.Column(db.String(500))
    start_time = db.Column(db.DateTime)
    end_time = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    tasks = db.relationship('Task', backref='user', lazy=True)
    interactions = db.relationship('Interaction', backref='user', lazy=True)
    navigations = db.relationship('Navigation', backref='user', lazy=True)

class Task(db.Model):
    __tablename__ = 'task'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    task_original_id = db.Column(db.Integer)
    title = db.Column(db.String(200))
    description = db.Column(db.Text)
    start_time = db.Column(db.DateTime)
    end_time = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    answers = db.relationship('Answer', backref='task', lazy=True)

class Answer(db.Model):
    __tablename__ = 'answer'
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'))
    question = db.Column(db.Text)
    answer = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.now)

class Interaction(db.Model):
    __tablename__ = 'interaction'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=True)
    type = db.Column(db.String(50))
    element = db.Column(db.String(50), nullable=True)
    element_id = db.Column(db.String(100), nullable=True)
    element_class = db.Column(db.String(100), nullable=True)
    position_x = db.Column(db.Integer, nullable=True)
    position_y = db.Column(db.Integer, nullable=True)
    timestamp = db.Column(db.DateTime)
    details = db.Column(db.Text, nullable=True)  # For additional JSON data
    created_at = db.Column(db.DateTime, default=datetime.now)

class Navigation(db.Model):
    __tablename__ = 'navigation'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=True)
    url = db.Column(db.String(500))
    title = db.Column(db.String(500), nullable=True)
    type = db.Column(db.String(50), nullable=True)  # page_load, tab_switch, etc.
    timestamp = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.now)

# Create database if it doesn't exist
def init_db():
    try:
        # Connect to MySQL server without selecting a database
        conn = pymysql.connect(
            host='localhost',
            user='root',
            password='password'
        )
        cursor = conn.cursor()
        
        # Create database if it doesn't exist
        cursor.execute("CREATE DATABASE IF NOT EXISTS transparency_db")
        conn.commit()
        
        # Switch to the transparency_db
        cursor.execute("USE transparency_db")
        
        # Drop tables if they exist to ensure clean creation
        cursor.execute("DROP TABLE IF EXISTS navigation")
        cursor.execute("DROP TABLE IF EXISTS interaction")
        cursor.execute("DROP TABLE IF EXISTS answer")
        cursor.execute("DROP TABLE IF EXISTS task")
        cursor.execute("DROP TABLE IF EXISTS user")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print("Database 'transparency_db' prepared successfully")
        
    except Exception as e:
        print(f"Error preparing database: {e}")
        raise e

# Initialize database before creating tables
with app.app_context():
    init_db()
    db.create_all()
    print("Database tables created successfully")

# Guardar os JSON recebidos
tasks_data = []

@app.route('/')
def index():
    return render_template('index.html', tasks=tasks_data)

@app.route('/submit_tasks', methods=['POST'])
def submit_tasks():
    data = request.json  # Obtém os dados JSON enviados pela extensão
    
    # Store the data in database
    try:
        # Create user
        user = User(
            username=data.get('username', 'Anonymous'),
            session_id=data.get('sessionId'),
            seco_portal=data.get('seco_portal'),
            user_agent=data.get('userAgent'),
            start_time=datetime.fromisoformat(data.get('startTime').replace('Z', '+00:00')) if data.get('startTime') else None,
            end_time=datetime.fromisoformat(data.get('endTime').replace('Z', '+00:00')) if data.get('endTime') else None
        )
        db.session.add(user)
        db.session.flush()  # To get the user ID
        
        # Store tasks and answers
        task_map = {}  # To map original task IDs to database task IDs
        
        for task_data in data.get('performed_tasks', []):
            task = Task(
                user_id=user.id,
                task_original_id=task_data.get('id'),
                title=task_data.get('title'),
                description=task_data.get('description'),
                start_time=datetime.fromisoformat(task_data.get('initial_timestamp').replace('Z', '+00:00')) if task_data.get('initial_timestamp') else None,
                end_time=datetime.fromisoformat(task_data.get('final_timestamp').replace('Z', '+00:00')) if task_data.get('final_timestamp') else None
            )
            db.session.add(task)
            db.session.flush()  # To get the task ID
            
            task_map[task_data.get('id')] = task.id
            
            # Store answers
            for answer_data in task_data.get('answers', []):
                answer = Answer(
                    task_id=task.id,
                    question=answer_data.get('question'),
                    answer=answer_data.get('answer')
                )
                db.session.add(answer)
        
        # Store interactions
        for interaction_data in data.get('interactions', []):
            # Find associated task ID if available
            task_id = None
            if interaction_data.get('taskId'):
                task_id = task_map.get(interaction_data.get('taskId'))
            
            # Convert timestamp
            timestamp = None
            if interaction_data.get('timestamp'):
                timestamp = datetime.fromisoformat(interaction_data.get('timestamp').replace('Z', '+00:00'))
            
            # Store position as separate columns if available
            position_x = None
            position_y = None
            if interaction_data.get('position'):
                position_x = interaction_data.get('position').get('x')
                position_y = interaction_data.get('position').get('y')
            
            # Store any additional details as JSON
            details = None
            detail_fields = ['phase', 'depth', 'status', 'newPhase']
            detail_dict = {k: interaction_data.get(k) for k in detail_fields if k in interaction_data and interaction_data.get(k) is not None}
            if detail_dict:
                details = json.dumps(detail_dict)
            
            interaction = Interaction(
                user_id=user.id,
                task_id=task_id,
                type=interaction_data.get('type'),
                element=interaction_data.get('element'),
                element_id=interaction_data.get('elementId'),
                element_class=interaction_data.get('elementClass'),
                position_x=position_x,
                position_y=position_y,
                timestamp=timestamp,
                details=details
            )
            db.session.add(interaction)
        
        # Store navigation events
        for navigation_data in data.get('navigation', []):
            # Find associated task ID if available
            task_id = None
            if navigation_data.get('taskId'):
                task_id = task_map.get(navigation_data.get('taskId'))
            
            # Convert timestamp
            timestamp = None
            if navigation_data.get('timestamp'):
                timestamp = datetime.fromisoformat(navigation_data.get('timestamp').replace('Z', '+00:00'))
            
            navigation = Navigation(
                user_id=user.id,
                task_id=task_id,
                url=navigation_data.get('url'),
                title=navigation_data.get('title'),
                type=navigation_data.get('type', 'page_load'),
                timestamp=timestamp
            )
            db.session.add(navigation)
        
        # Commit all changes
        db.session.commit()
        
        # Also keep the old behavior for backward compatibility
        tasks_data.extend(data.get('performed_tasks', []))
        print("Dados recebidos:", data) 
        
        return jsonify({
            "message": "Dados recebidos com sucesso",
            "user_id": user.id
        }), 200
    
    except Exception as e:
        db.session.rollback()
        print("Erro ao salvar dados:", str(e))
        return jsonify({
            "message": "Erro ao salvar dados",
            "error": str(e)
        }), 500


@app.route('/gettasks', methods=['GET'])
def get_tasks():
    selected_tasks = [{
        "id": 1,
        "title": "Task 1",
        "description": "Translate the page into Portuguese.",
        "questions": [
        { "text": "Could you solve the task? If not, could you explain why?" },
        { "text": "In your opinion, is the portal's translation system effective?" },
        { "text": "What do you think about the page design?" }
        ]
    },
    {
        "id": 2,
        "title": "Task 2",
        "description": "Find the language documentation.",
        "questions": [
        { "text": "Could you solve the task? If not, could you explain why?" },
        { "text": "Q2?" }
        ]
    },{
        "id": 3,
        "title": "Task 3",
        "description": "Task description.",
        "questions": [
        { "text": "Q1?" },
        { "text": "Q2?" }
        ]
    }]
    return jsonify(selected_tasks)

# Simple dashboard route
@app.route('/dashboard')
def dashboard():
    try:
        users_count = User.query.count()
        tasks_count = Task.query.count()
        interactions_count = Interaction.query.count()
        
        return render_template('dashboard.html', 
                            users_count=users_count, 
                            tasks_count=tasks_count, 
                            interactions_count=interactions_count)
    except Exception as e:
        return f"Error loading dashboard: {str(e)}"

# Fix the analytics query for MySQL
@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    try:
        # Task completion times - using MySQL specific timestamp difference
        task_times = db.session.query(
            Task.task_original_id,
            db.func.avg(db.func.timestampdiff(db.text('SECOND'), Task.start_time, Task.end_time)).label('avg_time')
        ).group_by(Task.task_original_id).all()
        
        task_times_data = [{"task_id": t[0], "avg_time_seconds": float(t[1] if t[1] is not None else 0)} for t in task_times]
        
        # Most common interactions
        interaction_types = db.session.query(
            Interaction.type,
            db.func.count(Interaction.id).label('count')
        ).group_by(Interaction.type).order_by(db.func.count(Interaction.id).desc()).limit(5).all()
        
        interaction_types_data = [{"type": t[0], "count": t[1]} for t in interaction_types]
        
        return jsonify({
            "task_completion_times": task_times_data,
            "interaction_types": interaction_types_data
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Add a route to view raw data
@app.route('/view_data')
def view_data():
    try:
        users = User.query.all()
        result = []
        
        for user in users:
            user_data = {
                'id': user.id,
                'username': user.username,
                'session_id': user.session_id,
                'seco_portal': user.seco_portal,
                'start_time': user.start_time.isoformat() if user.start_time else None,
                'end_time': user.end_time.isoformat() if user.end_time else None,
                'tasks': [],
                'total_interactions': len(user.interactions)
            }
            
            for task in user.tasks:
                task_data = {
                    'id': task.id,
                    'task_original_id': task.task_original_id,
                    'title': task.title,
                    'description': task.description,
                    'start_time': task.start_time.isoformat() if task.start_time else None,
                    'end_time': task.end_time.isoformat() if task.end_time else None,
                    'duration_seconds': (task.end_time - task.start_time).total_seconds() if task.end_time and task.start_time else None,
                    'answers': [{'question': a.question, 'answer': a.answer} for a in task.answers]
                }
                user_data['tasks'].append(task_data)
                
            result.append(user_data)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)