-- Reference schema based on the entities and attributes in the FinSight AI progress report.
-- Review against your original finsight_ai.sql before running on an existing database.
-- This file is intended for a NEW finsight_ai database, not for overwriting an existing one.

CREATE DATABASE IF NOT EXISTS finsight_ai
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE finsight_ai;

CREATE TABLE IF NOT EXISTS `User` (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `Account` (
  account_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  account_type VARCHAR(30) NOT NULL DEFAULT 'bank',
  bank_name VARCHAR(100),
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  CONSTRAINT fk_account_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `Category` (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  parent_category_id INT NULL,
  CONSTRAINT fk_category_parent FOREIGN KEY (parent_category_id) REFERENCES `Category`(category_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `Transaction` (
  transaction_id INT AUTO_INCREMENT PRIMARY KEY,
  account_id INT NOT NULL,
  category_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  txn_date DATE NOT NULL,
  description VARCHAR(255),
  txn_type ENUM('income','expense') NOT NULL,
  is_anomaly BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT ck_transaction_amount_positive CHECK (amount > 0),
  CONSTRAINT fk_transaction_account FOREIGN KEY (account_id) REFERENCES `Account`(account_id) ON DELETE CASCADE,
  CONSTRAINT fk_transaction_category FOREIGN KEY (category_id) REFERENCES `Category`(category_id) ON DELETE RESTRICT,
  INDEX idx_transaction_account_date (account_id, txn_date)
);

CREATE TABLE IF NOT EXISTS `Budget` (
  budget_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  category_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  period VARCHAR(20) NOT NULL DEFAULT 'monthly',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  CONSTRAINT ck_budget_amount_positive CHECK (amount > 0),
  CONSTRAINT ck_budget_dates CHECK (end_date >= start_date),
  CONSTRAINT fk_budget_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_category FOREIGN KEY (category_id) REFERENCES `Category`(category_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS `SavingsGoal` (
  goal_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  target_amount DECIMAL(12,2) NOT NULL,
  current_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  deadline DATE,
  CONSTRAINT ck_goal_target_positive CHECK (target_amount > 0),
  CONSTRAINT ck_goal_current_nonnegative CHECK (current_amount >= 0),
  CONSTRAINT fk_goal_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `Prediction` (
  prediction_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  category_id INT NOT NULL,
  predicted_amount DECIMAL(12,2) NOT NULL,
  period VARCHAR(20) NOT NULL,
  generated_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prediction_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_prediction_category FOREIGN KEY (category_id) REFERENCES `Category`(category_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS `Recommendation` (
  recommendation_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(40) NOT NULL,
  description TEXT NOT NULL,
  generated_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recommendation_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE
);

INSERT IGNORE INTO `Category` (name) VALUES
('Food & dining'), ('Housing'), ('Transport'), ('Shopping'),
('Bills & utilities'), ('Healthcare'), ('Income'), ('Other');
