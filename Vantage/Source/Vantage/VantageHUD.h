#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "VantageHUD.generated.h"

class ARevolver;
class AVantageCharacter;
class AVantageGameMode;

/**
 * Everything on screen, drawn with Canvas primitives.
 *
 * UMG would mean .uasset widgets, which this project deliberately does without,
 * so the crosshair, bars and banners are all drawn by hand here.
 */
UCLASS()
class VANTAGE_API AVantageHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

private:
	void DrawCrosshair(const ARevolver* Revolver);
	void DrawHitMarker(const AVantageCharacter* Player);
	void DrawHealth(const AVantageCharacter* Player);
	void DrawAmmo(const ARevolver* Revolver);
	void DrawRunState(const AVantageGameMode* GameMode);

	/**
	 * Diamond on the objective, or an arrow pinned to the screen edge pointing
	 * at it. Without this the vault is 46 metres of identical sand away and
	 * there is nothing to steer by.
	 */
	void DrawObjectiveMarker(const AVantageGameMode* GameMode, const AVantageCharacter* Player);

	/** Four dials, drawn only while he is stood at the lock. */
	void DrawLockPanel(const AVantageCharacter* Player);

	/** The combination, readable off the plaque when he is stood at it. */
	void DrawPlaque(const AVantageGameMode* GameMode, const AVantageCharacter* Player);

	/** What the dog is doing, and whether it is rebooting. */
	void DrawDogStatus(const AVantageCharacter* Player);

	/** "[E] Work the lock" and friends. */
	void DrawReachPrompt(const AVantageCharacter* Player);
	void DrawDamageVignette(float Strength);
	void DrawDownBanner();

	/** Centred text helper. Returns the width it drew. */
	float DrawCentredText(const FString& Text, const FLinearColor& Colour, float CentreX, float Y, UFont* Font, float Scale);
};
