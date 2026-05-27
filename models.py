# models.py — SQLAlchemy database models for BAMS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import uuid

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    role = db.Column(db.String(20), nullable=False)  # admin, teacher, student, parent
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100))
    avatar_initials = db.Column(db.String(3))
    avatar_color = db.Column(db.String(20), default='#1C3A6B')

    # Student fields
    student_id_code = db.Column(db.String(20))
    grade = db.Column(db.String(30))
    department = db.Column(db.String(50))
    biometric_enrolled = db.Column(db.Boolean, default=False)
    biometric_enrolled_at = db.Column(db.DateTime)

    # Teacher fields
    subjects = db.Column(db.Text)  # JSON list

    # Parent fields
    alert_threshold = db.Column(db.Integer, default=75)
    notifications_enabled = db.Column(db.Boolean, default=True)

    # Relationships
    parent_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    children = db.relationship(
        'User', backref=db.backref('parent_user', remote_side='User.id'),
        foreign_keys=[parent_id], lazy=True
    )
    credentials = db.relationship(
        'WebAuthnCredential', backref='user', lazy=True,
        cascade='all, delete-orphan'
    )
    attendance_logs = db.relationship(
        'AttendanceLog', foreign_keys='AttendanceLog.student_id',
        backref='student', lazy=True
    )

    def to_dict(self):
        return {
            'id': self.id,
            'role': self.role,
            'name': self.name,
            'email': self.email,
            'avatar_initials': self.avatar_initials,
            'avatar_color': self.avatar_color,
            'student_id_code': self.student_id_code,
            'grade': self.grade,
            'department': self.department,
            'biometric_enrolled': self.biometric_enrolled,
            'parent_id': self.parent_id,
            'alert_threshold': self.alert_threshold,
        }


class WebAuthnCredential(db.Model):
    __tablename__ = 'webauthn_credentials'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    credential_id = db.Column(db.Text, nullable=False, unique=True)
    public_key = db.Column(db.Text, nullable=False)
    sign_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Device(db.Model):
    __tablename__ = 'devices'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)
    location = db.Column(db.String(200))
    device_type = db.Column(db.String(50))
    model_name = db.Column(db.String(50))
    ip_address = db.Column(db.String(20))
    status = db.Column(db.String(10), default='online')
    configured_by = db.Column(db.String(36))
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    attendance_logs = db.relationship('AttendanceLog', backref='device', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'location': self.location,
            'device_type': self.device_type,
            'model_name': self.model_name,
            'ip_address': self.ip_address,
            'status': self.status,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
        }


class AttendanceLog(db.Model):
    __tablename__ = 'attendance_logs'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    device_id = db.Column(db.String(36), db.ForeignKey('devices.id'), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(10), nullable=False)  # present, late, absent
    method = db.Column(db.String(20), default='fingerprint')
    synced = db.Column(db.Boolean, default=True)
    session_label = db.Column(db.String(50))

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'device_id': self.device_id,
            'timestamp': self.timestamp.isoformat(),
            'status': self.status,
            'method': self.method,
            'synced': self.synced,
            'session_label': self.session_label,
        }


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    id = db.Column(db.Integer, primary_key=True)
    action = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text)
    actor_id = db.Column(db.String(36))
    target_id = db.Column(db.String(36))
    ip_address = db.Column(db.String(20))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)


class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True)
    recipient_id = db.Column(db.String(36), nullable=False)
    type = db.Column(db.String(20))  # warning, info, success, critical
    message = db.Column(db.Text)
    student_id = db.Column(db.String(36))
    read = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
