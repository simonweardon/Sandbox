#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "VantageHUD.generated.h"

/**
 * Everything on screen, drawn with Canvas primitives.
 *
 * UMG would mean .uasset widgets, which this project deliberately does without,
 * so the crosshair, prompt and objective line are all drawn by hand here.
 */
UCLASS()
class VANTAGE_API AVantageHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

private:
	void DrawCrosshair(bool bFocused, bool bLocked);
	void DrawPrompt(const FText& Prompt, bool bLocked);
	void DrawObjective(const FText& Objective, int32 Collected, int32 Required);
	void DrawCompletionBanner(float TimeSinceCompletion);

	/** Centred text helper. Returns the width it drew. */
	float DrawCentredText(const FString& Text, const FLinearColor& Colour, float CentreX, float Y, UFont* Font, float Scale);
};
