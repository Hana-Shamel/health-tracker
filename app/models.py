from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LogEntry(Base):
    __tablename__ = "log_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    text: Mapped[str] = mapped_column(Text)
    tags: Mapped[str] = mapped_column(Text)


class Pill(Base):
    __tablename__ = "pills"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    shape: Mapped[str] = mapped_column(String(20))
    color: Mapped[str] = mapped_column(String(7))
    color_right: Mapped[str | None] = mapped_column(String(7), nullable=True)

    placements: Mapped[list[Placement]] = relationship(
        back_populates="pill",
        cascade="all, delete-orphan",
    )


class PillBox(Base):
    __tablename__ = "pill_boxes"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    placements: Mapped[list[Placement]] = relationship(
        back_populates="pill_box",
        cascade="all, delete-orphan",
    )


class Placement(Base):
    __tablename__ = "placements"
    __table_args__ = (
        UniqueConstraint("pill_box_id", "weekday", "slot", name="uq_placement_slot"),
        CheckConstraint("weekday >= 0 AND weekday <= 6", name="ck_weekday"),
        CheckConstraint("slot >= 0 AND slot <= 11", name="ck_slot"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pill_box_id: Mapped[int] = mapped_column(ForeignKey("pill_boxes.id", ondelete="CASCADE"), index=True)
    weekday: Mapped[int] = mapped_column(Integer)
    slot: Mapped[int] = mapped_column(Integer)
    pill_id: Mapped[int] = mapped_column(ForeignKey("pills.id", ondelete="CASCADE"), index=True)

    pill_box: Mapped[PillBox] = relationship(back_populates="placements")
    pill: Mapped[Pill] = relationship(back_populates="placements")


class Visit(Base):
    __tablename__ = "visits"

    id: Mapped[int] = mapped_column(primary_key=True)
    visit_date: Mapped[date] = mapped_column(Date, index=True)
    doctor_kind: Mapped[str] = mapped_column(String(200))
    doctor_name: Mapped[str] = mapped_column(String(200))
    conclusion: Mapped[str] = mapped_column(Text, default="", server_default="")
    prescription: Mapped[str] = mapped_column(Text, default="", server_default="")
    next_steps: Mapped[str] = mapped_column(Text, default="", server_default="")
