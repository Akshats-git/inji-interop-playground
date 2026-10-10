-- Inji Verify v0.18.2 schema, from inji-verify/docker-compose/db-init/init.sql (MPL-2.0), wrapped in its own database.
CREATE DATABASE inji_verify;
\c inji_verify postgres
CREATE SCHEMA IF NOT EXISTS verify;

CREATE TABLE IF NOT EXISTS verify.authorization_request_details (
    request_id character varying(40) NOT NULL,
    transaction_id character varying(40) NOT NULL,
    authorization_details text NOT NULL,
    expires_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS verify.presentation_definition(
    id character varying(36) NOT NULL,
    input_descriptors jsonb NOT NULL,
    name character varying(500),
    purpose character varying(500),
    vp_format text,
    submission_requirements text
);

CREATE TABLE IF NOT EXISTS verify.vc_submission(
    transaction_id character varying(40) NOT NULL,
    vc text NOT NULL
);

CREATE TABLE IF NOT EXISTS verify.vp_submission(
    request_id character varying(40) NOT NULL,
    vp_token VARCHAR NOT NULL,
    presentation_submission text NOT NULL,
    error character varying(100) NULL,
    error_description character varying(200) NULL
);
ALTER DATABASE inji_verify SET search_path TO verify,pg_catalog,public;
